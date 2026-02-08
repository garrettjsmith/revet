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
 */
export async function listGBPAccounts(): Promise<GBPAccount[]> {
  const response = await googleFetch(`${ACCOUNT_MANAGEMENT_API}/accounts`)

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Failed to list GBP accounts: ${response.status} ${JSON.stringify(err)}`)
  }

  const data = await response.json()
  return data.accounts || []
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
 * Discover all GBP accounts and their locations.
 * Returns a flat list of locations with their parent account info.
 * Fetches accounts in parallel for speed (important for 600+ location accounts).
 */
export async function discoverAllLocations(): Promise<{
  accounts: GBPAccount[]
  locations: Array<GBPLocation & { accountName: string; accountDisplayName: string }>
}> {
  const accounts = await listGBPAccounts()
  console.log(`[google/accounts] Found ${accounts.length} accounts, fetching locations...`)

  const fetchable = accounts.filter((a) => a.type !== 'USER_GROUP')

  // Fetch locations for all accounts in parallel
  const results = await Promise.allSettled(
    fetchable.map(async (account) => {
      const locations = await listGBPLocations(account.name)
      console.log(`[google/accounts] ${account.accountName}: ${locations.length} locations`)
      return locations.map((loc) => ({
        ...loc,
        accountName: account.name,
        accountDisplayName: account.accountName,
      }))
    })
  )

  const allLocations: Array<GBPLocation & { accountName: string; accountDisplayName: string }> = []
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status === 'fulfilled') {
      allLocations.push(...result.value)
    } else {
      console.error(`[google/accounts] Failed to list locations for ${fetchable[i].name}:`, result.reason)
    }
  }

  console.log(`[google/accounts] Total: ${allLocations.length} locations across ${fetchable.length} accounts`)
  return { accounts, locations: allLocations }
}
