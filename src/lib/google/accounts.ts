import { googleFetch } from './auth'

const ACCOUNT_MANAGEMENT_API = 'https://mybusinessaccountmanagement.googleapis.com/v1'
const BUSINESS_INFO_API = 'https://mybusinessbusinessinformation.googleapis.com/v1'

export interface GBPAccount {
  name: string        // "accounts/123456"
  accountName: string // Human-readable name
  type: string        // "PERSONAL" | "LOCATION_GROUP" | "ORGANIZATION" | "USER_GROUP"
  role: string        // "PRIMARY_OWNER" | "OWNER" | "MANAGER" | "SITE_MANAGER"
  accountNumber: string
}

export interface GBPLocation {
  name: string            // "locations/abc123"
  title: string           // Business name
  storefrontAddress?: {
    addressLines: string[]
    locality: string      // City
    administrativeArea: string // State
    postalCode: string
    regionCode: string    // "US"
  }
  phoneNumbers?: {
    primaryPhone: string
  }
  websiteUri?: string
  categories?: {
    primaryCategory?: {
      displayName: string
      name: string
    }
  }
  metadata?: {
    placeId?: string
    mapsUri?: string
  }
}

/**
 * List all GBP accounts accessible to the connected Google account.
 * Paginates through all pages (default page size is 20).
 */
export async function listGBPAccounts(): Promise<GBPAccount[]> {
  const accounts: GBPAccount[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({ pageSize: '20' })
    if (pageToken) params.set('pageToken', pageToken)

    const response = await googleFetch(`${ACCOUNT_MANAGEMENT_API}/accounts?${params.toString()}`)

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`Failed to list GBP accounts: ${response.status} ${JSON.stringify(err)}`)
    }

    const data = await response.json()
    if (data.accounts) accounts.push(...data.accounts)
    pageToken = data.nextPageToken
  } while (pageToken)

  return accounts
}

/**
 * List all locations under a GBP account.
 * Paginates automatically to get all locations.
 */
export async function listGBPLocations(accountName: string): Promise<GBPLocation[]> {
  const readMask = 'name,title,storefrontAddress,phoneNumbers,websiteUri,categories,metadata'
  const locations: GBPLocation[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      readMask,
      pageSize: '100',
    })
    if (pageToken) params.set('pageToken', pageToken)

    const response = await googleFetch(
      `${BUSINESS_INFO_API}/${accountName}/locations?${params.toString()}`
    )

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`Failed to list locations: ${response.status} ${JSON.stringify(err)}`)
    }

    const data = await response.json()
    if (data.locations) locations.push(...data.locations)
    pageToken = data.nextPageToken
  } while (pageToken)

  return locations
}

/**
 * Discover ALL GBP locations the authenticated user can access.
 *
 * Uses the wildcard endpoint `accounts/-/locations` which returns locations
 * across all accounts, location groups, and organizations — not just directly
 * owned ones. This is critical for large accounts (600+ locations) where
 * locations are organized into Location Groups.
 *
 * Also fetches accounts for metadata (display names) used in the UI.
 */
export async function discoverAllLocations(): Promise<{
  accounts: GBPAccount[]
  locations: Array<GBPLocation & { accountName: string; accountDisplayName: string }>
}> {
  // Fetch accounts (for metadata) and ALL locations in parallel
  const [accounts, allLocations] = await Promise.all([
    listGBPAccounts(),
    listGBPLocations('accounts/-'),  // wildcard = all accessible locations
  ])

  console.log(`[google/accounts] Found ${accounts.length} accounts, ${allLocations.length} total locations via wildcard`)

  // Build account lookup for display names
  const accountMap = new Map<string, string>()
  for (const acct of accounts) {
    accountMap.set(acct.name, acct.accountName)
  }

  // Deduplicate by location name (a location can appear in multiple groups)
  const seen = new Set<string>()
  const deduped: Array<GBPLocation & { accountName: string; accountDisplayName: string }> = []

  for (const loc of allLocations) {
    if (seen.has(loc.name)) continue
    seen.add(loc.name)

    // The location's name format is "locations/xxx" — no account prefix in wildcard response.
    // Try to match account from metadata or fall back to "Unknown"
    const accountName = ''
    const accountDisplayName = accountMap.get(accountName) || ''

    deduped.push({
      ...loc,
      accountName,
      accountDisplayName,
    })
  }

  console.log(`[google/accounts] After dedup: ${deduped.length} unique locations`)
  return { accounts, locations: deduped }
}
