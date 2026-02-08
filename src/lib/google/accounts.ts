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
 */
export async function discoverAllLocations(): Promise<{
  accounts: GBPAccount[]
  locations: Array<GBPLocation & { accountName: string; accountDisplayName: string }>
}> {
  const accounts = await listGBPAccounts()
  const allLocations: Array<GBPLocation & { accountName: string; accountDisplayName: string }> = []

  for (const account of accounts) {
    // Skip USER_GROUP accounts — they don't have locations
    if (account.type === 'USER_GROUP') continue

    try {
      const locations = await listGBPLocations(account.name)
      for (const loc of locations) {
        allLocations.push({
          ...loc,
          accountName: account.name,
          accountDisplayName: account.accountName,
        })
      }
    } catch (err) {
      // Some accounts may not have location access — continue with others
      console.error(`[google/accounts] Failed to list locations for ${account.name}:`, err)
    }
  }

  return { accounts, locations: allLocations }
}
