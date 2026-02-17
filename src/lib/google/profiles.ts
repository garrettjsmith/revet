import { googleFetch } from './auth'

const BUSINESS_INFO_API = 'https://mybusinessbusinessinformation.googleapis.com/v1'
const GBP_V4_API = 'https://mybusiness.googleapis.com/v4'

/** Ensure a location name has an account prefix for the v4 API. */
function toV4ResourceName(name: string): string {
  if (name.startsWith('locations/')) {
    return `accounts/-/${name}`
  }
  return name
}

/** Full readMask for fetching complete profile data */
const FULL_READ_MASK = [
  'name', 'title', 'storeCode', 'languageCode', 'phoneNumbers',
  'categories', 'storefrontAddress', 'websiteUri', 'regularHours',
  'specialHours', 'serviceArea', 'labels', 'latlng', 'openInfo',
  'metadata', 'profile', 'moreHours', 'serviceItems', 'menuUri',
].join(',')

// ─── Profile Fetch ──────────────────────────────────────────

export interface GBPProfileRaw {
  name: string
  title?: string
  storeCode?: string
  languageCode?: string
  phoneNumbers?: {
    primaryPhone?: string
    additionalPhones?: string[]
  }
  categories?: {
    primaryCategory?: { name: string; displayName: string }
    additionalCategories?: Array<{ name: string; displayName: string }>
  }
  storefrontAddress?: {
    regionCode?: string
    languageCode?: string
    postalCode?: string
    administrativeArea?: string
    locality?: string
    addressLines?: string[]
  }
  websiteUri?: string
  regularHours?: {
    periods?: Array<{
      openDay: string
      openTime: string
      closeDay: string
      closeTime: string
    }>
  }
  specialHours?: {
    specialHourPeriods?: Array<Record<string, unknown>>
  }
  moreHours?: Array<Record<string, unknown>>
  serviceArea?: Record<string, unknown>
  labels?: string[]
  latlng?: { latitude: number; longitude: number }
  openInfo?: { status?: string; canReopen?: boolean }
  metadata?: {
    mapsUri?: string
    newReviewUri?: string
    placeId?: string
    hasVoiceOfMerchant?: boolean
    hasPendingEdits?: boolean
    hasGoogleUpdated?: boolean
  }
  profile?: { description?: string }
  serviceItems?: Array<Record<string, unknown>>
  menuUri?: string
}

/**
 * Fetch the full GBP profile for a location.
 * @param locationName - "locations/abc123"
 */
export async function fetchGBPProfile(locationName: string): Promise<GBPProfileRaw> {
  const response = await googleFetch(
    `${BUSINESS_INFO_API}/${locationName}?readMask=${FULL_READ_MASK}`
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Failed to fetch GBP profile: ${response.status} ${JSON.stringify(err)}`)
  }

  return response.json()
}

/**
 * Transform raw Google profile data into our DB column format.
 */
export function normalizeGBPProfile(raw: GBPProfileRaw) {
  // Infer verification state from hasVoiceOfMerchant (separate Verification API
  // is not needed — VoM true means the business is verified and owner-confirmed).
  const verificationState = raw.metadata?.hasVoiceOfMerchant === true
    ? 'VERIFIED'
    : raw.metadata?.hasVoiceOfMerchant === false
      ? 'UNVERIFIED'
      : null

  return {
    business_name: raw.title || null,
    description: raw.profile?.description || null,
    website_uri: raw.websiteUri || null,
    menu_uri: raw.menuUri || null,
    phone_primary: raw.phoneNumbers?.primaryPhone || null,
    primary_category_id: raw.categories?.primaryCategory?.name?.replace('categories/', '') || null,
    primary_category_name: raw.categories?.primaryCategory?.displayName || null,
    open_status: raw.openInfo?.status || null,
    verification_state: verificationState,
    latitude: raw.latlng?.latitude || null,
    longitude: raw.latlng?.longitude || null,
    maps_uri: raw.metadata?.mapsUri || null,
    new_review_uri: raw.metadata?.newReviewUri || null,
    has_pending_edits: raw.metadata?.hasPendingEdits || false,
    has_google_updated: raw.metadata?.hasGoogleUpdated || false,
    additional_categories: (raw.categories?.additionalCategories || []).map((c) => ({
      name: c.name,
      displayName: c.displayName,
    })),
    regular_hours: raw.regularHours || {},
    special_hours: raw.specialHours?.specialHourPeriods || [],
    more_hours: raw.moreHours || [],
    additional_phones: raw.phoneNumbers?.additionalPhones || [],
    address: raw.storefrontAddress || {},
    service_area: raw.serviceArea || {},
    labels: raw.labels || [],
    service_items: raw.serviceItems || [],
    raw_google_data: raw,
  }
}

// ─── Profile Update ─────────────────────────────────────────

/**
 * Update a GBP location profile.
 * @param locationName - "locations/abc123"
 * @param fields - Object with fields to update
 * @param updateMask - Comma-separated field names to update
 */
export async function updateGBPProfile(
  locationName: string,
  fields: Partial<GBPProfileRaw>,
  updateMask: string
): Promise<GBPProfileRaw> {
  const response = await googleFetch(
    `${BUSINESS_INFO_API}/${locationName}?updateMask=${updateMask}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    }
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Failed to update GBP profile: ${response.status} ${JSON.stringify(err)}`)
  }

  return response.json()
}

// ─── Categories ─────────────────────────────────────────────

export interface GBPCategoryInfo {
  name: string
  displayName: string
  serviceTypes?: string[]
  moreHoursTypes?: Array<{ hoursTypeId: string; displayName: string }>
}

/**
 * Search GBP categories by name.
 */
export async function searchCategories(
  query: string,
  opts?: { regionCode?: string; languageCode?: string; pageSize?: number }
): Promise<GBPCategoryInfo[]> {
  const params = new URLSearchParams({
    regionCode: opts?.regionCode || 'US',
    languageCode: opts?.languageCode || 'en',
    view: 'FULL',
    pageSize: String(opts?.pageSize || 50),
  })
  if (query) params.set('filter', `displayName=${query}`)

  const response = await googleFetch(
    `${BUSINESS_INFO_API}/categories?${params.toString()}`
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Failed to search categories: ${response.status} ${JSON.stringify(err)}`)
  }

  const data = await response.json()
  return data.categories || []
}

// ─── Attributes ─────────────────────────────────────────────

export interface GBPAttributeMetadata {
  attributeId: string
  valueType: string
  displayName: string
  groupDisplayName?: string
  isRepeatable?: boolean
  valueMetadata?: Array<{ value: string; displayName: string }>
}

/**
 * Get available attributes for a location's category.
 */
export async function fetchAvailableAttributes(
  categoryName: string,
  opts?: { regionCode?: string; languageCode?: string }
): Promise<GBPAttributeMetadata[]> {
  const params = new URLSearchParams({
    categoryName: `categories/${categoryName}`,
    regionCode: opts?.regionCode || 'US',
    languageCode: opts?.languageCode || 'en',
  })

  const response = await googleFetch(
    `${BUSINESS_INFO_API}/attributes?${params.toString()}`
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Failed to fetch attributes: ${response.status} ${JSON.stringify(err)}`)
  }

  const data = await response.json()
  return data.attributeMetadata || []
}

/**
 * Get current attributes for a location.
 */
export async function fetchLocationAttributes(
  locationName: string
): Promise<Array<Record<string, unknown>>> {
  const response = await googleFetch(
    `${BUSINESS_INFO_API}/${locationName}/attributes`
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Failed to fetch location attributes: ${response.status} ${JSON.stringify(err)}`)
  }

  const data = await response.json()
  return data.attributes || []
}

/**
 * Update attributes for a location.
 */
export async function updateLocationAttributes(
  locationName: string,
  attributes: Array<Record<string, unknown>>,
  attributeMask: string
): Promise<void> {
  const response = await googleFetch(
    `${BUSINESS_INFO_API}/${locationName}/attributes?attributeMask=${attributeMask}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${locationName}/attributes`,
        attributes,
      }),
    }
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Failed to update attributes: ${response.status} ${JSON.stringify(err)}`)
  }
}

// ─── Media / Photos ─────────────────────────────────────────
// Media API is still v4

export interface GBPMediaItem {
  name: string
  mediaFormat: string
  locationAssociation?: { category: string }
  googleUrl?: string
  thumbnailUrl?: string
  createTime?: string
  description?: string
  dimensions?: { widthPixels: number; heightPixels: number }
  sourceUrl?: string
}

/**
 * List all media for a location.
 * Requires account-scoped resource name for v4 API.
 */
export async function listMedia(accountLocationName: string): Promise<GBPMediaItem[]> {
  const v4Name = toV4ResourceName(accountLocationName)
  const response = await googleFetch(`${GBP_V4_API}/${v4Name}/media`)

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Failed to list media: ${response.status} ${JSON.stringify(err)}`)
  }

  const data = await response.json()
  return data.mediaItems || []
}

/**
 * Create a media item from a URL.
 */
export async function createMediaFromUrl(
  accountLocationName: string,
  sourceUrl: string,
  category: string,
  description?: string
): Promise<GBPMediaItem> {
  const v4Name = toV4ResourceName(accountLocationName)
  const response = await googleFetch(`${GBP_V4_API}/${v4Name}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mediaFormat: 'PHOTO',
      locationAssociation: { category },
      sourceUrl,
      ...(description ? { description } : {}),
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Failed to create media: ${response.status} ${JSON.stringify(err)}`)
  }

  return response.json()
}

/**
 * Delete a media item.
 */
export async function deleteMedia(mediaResourceName: string): Promise<void> {
  const v4Name = toV4ResourceName(mediaResourceName)
  const response = await googleFetch(`${GBP_V4_API}/${v4Name}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Failed to delete media: ${response.status} ${JSON.stringify(err)}`)
  }
}

// ─── Google Posts (Local Posts) ──────────────────────────────
// Posts API is still v4

export interface GBPLocalPost {
  name?: string
  languageCode?: string
  summary?: string
  topicType: string
  media?: Array<{ mediaFormat: string; sourceUrl: string }>
  callToAction?: { actionType: string; url: string }
  event?: {
    title: string
    schedule: {
      startDate: { year: number; month: number; day: number }
      startTime?: { hours: number; minutes: number }
      endDate: { year: number; month: number; day: number }
      endTime?: { hours: number; minutes: number }
    }
  }
  offer?: {
    couponCode?: string
    redeemOnlineUrl?: string
    termsConditions?: string
  }
  state?: string
  createTime?: string
  updateTime?: string
  searchUrl?: string
}

/**
 * List posts for a location.
 */
export async function listPosts(
  accountLocationName: string,
  opts?: { pageSize?: number; pageToken?: string }
): Promise<{ posts: GBPLocalPost[]; nextPageToken?: string }> {
  const params = new URLSearchParams({
    pageSize: String(opts?.pageSize || 50),
  })
  if (opts?.pageToken) params.set('pageToken', opts.pageToken)

  const v4Name = toV4ResourceName(accountLocationName)
  const response = await googleFetch(
    `${GBP_V4_API}/${v4Name}/localPosts?${params.toString()}`
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Failed to list posts: ${response.status} ${JSON.stringify(err)}`)
  }

  const data = await response.json()
  return { posts: data.localPosts || [], nextPageToken: data.nextPageToken }
}

/**
 * Create a new post.
 */
export async function createPost(
  accountLocationName: string,
  post: GBPLocalPost
): Promise<GBPLocalPost> {
  const v4Name = toV4ResourceName(accountLocationName)
  const response = await googleFetch(`${GBP_V4_API}/${v4Name}/localPosts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(post),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Failed to create post: ${response.status} ${JSON.stringify(err)}`)
  }

  return response.json()
}

/**
 * Delete a post.
 */
export async function deletePost(postResourceName: string): Promise<void> {
  const v4Name = toV4ResourceName(postResourceName)
  const response = await googleFetch(`${GBP_V4_API}/${v4Name}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Failed to delete post: ${response.status} ${JSON.stringify(err)}`)
  }
}
