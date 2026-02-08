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
 * Two-phase approach:
 * 1. Fetch all accounts to get ownership metadata
 * 2. Fetch locations per-account to preserve the account→location mapping
 *    (the wildcard `accounts/-` endpoint strips account info from responses)
 *
 * Falls back to wildcard if per-account fetching yields no results (e.g. org-managed
 * accounts where locations are only visible via wildcard).
 */
export async function discoverAllLocations(): Promise<{
  accounts: GBPAccount[]
  locations: Array<GBPLocation & { accountName: string; accountDisplayName: string }>
}> {
  const accounts = await listGBPAccounts()

  console.log(`[google/accounts] Found ${accounts.length} accounts`)

  // Build account lookup for display names
  const accountMap = new Map<string, string>()
  for (const acct of accounts) {
    accountMap.set(acct.name, acct.accountName)
  }

  // Phase 1: Fetch locations per-account to preserve ownership
  const seen = new Set<string>()
  const deduped: Array<GBPLocation & { accountName: string; accountDisplayName: string }> = []

  for (const acct of accounts) {
    try {
      const locations = await listGBPLocations(acct.name)
      console.log(`[google/accounts] ${acct.name} (${acct.accountName}): ${locations.length} locations`)

      for (const loc of locations) {
        // Extract the location ID portion (e.g. "locations/abc123")
        const locKey = loc.name.startsWith('locations/') ? loc.name : loc.name.split('/').slice(-2).join('/')
        if (seen.has(locKey)) continue
        seen.add(locKey)

        deduped.push({
          ...loc,
          accountName: acct.name,
          accountDisplayName: acct.accountName,
        })
      }
    } catch (err) {
      // Some account types (ORGANIZATION, USER_GROUP) may not support listing
      console.warn(`[google/accounts] Could not list locations for ${acct.name}:`, err instanceof Error ? err.message : err)
    }
  }

  // Phase 2: If per-account yielded nothing, fall back to wildcard
  if (deduped.length === 0) {
    console.log(`[google/accounts] Per-account discovery found 0 locations, falling back to wildcard`)
    const wildcardLocations = await listGBPLocations('accounts/-')
    console.log(`[google/accounts] Wildcard found ${wildcardLocations.length} locations`)

    for (const loc of wildcardLocations) {
      if (seen.has(loc.name)) continue
      seen.add(loc.name)

      // Best-effort: use first PERSONAL account as owner
      const fallbackAccount = accounts.find((a) => a.type === 'PERSONAL') || accounts[0]

      deduped.push({
        ...loc,
        accountName: fallbackAccount?.name || '',
        accountDisplayName: fallbackAccount?.accountName || '',
      })
    }
  }

  console.log(`[google/accounts] Total: ${deduped.length} unique locations`)
  return { accounts, locations: deduped }
}
