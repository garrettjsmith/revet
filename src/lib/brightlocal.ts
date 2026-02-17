/**
 * BrightLocal API client.
 *
 * Two base URLs:
 *   - Management API (locations, business categories, Citation Builder):
 *     https://api.brightlocal.com/manage/v1  — auth via x-api-key header
 *   - Legacy CT API (Citation Tracker reports):
 *     https://tools.brightlocal.com/seo-tools/api  — auth via api-key param
 */

const MANAGE_BASE = 'https://api.brightlocal.com/manage/v1'
const LEGACY_BASE = 'https://tools.brightlocal.com/seo-tools/api'

// ─── Shared types ───────────────────────────────────────────

interface LegacyResponse<T = unknown> {
  success: boolean
  errors?: unknown
  response?: T
  report?: T // /v2/ct/get returns report at top level
}

interface CTReportStatus {
  report_id: string
  report_name: string
  status: string
}

interface CTResultsResponse {
  results: {
    active?: CTCitation[]
    pending?: CTCitation[]
    possible?: CTCitation[]
  }
}

export interface CTCitation {
  citation_id: number
  source: string
  url: string | null
  'citation-status': string
  status: string
  'domain-authority': string | null
  'site-type': string | null
  'listing-type': string | null
  'business-name': string | null
  address: string | null
  postcode: string | null
  telephone: string | null
  'date-identified': string | null
}

/** Subset of the Management API location response we care about */
export interface BLLocation {
  location_id: number
  business_name: string
  country: string
  telephone: string | null
  address: {
    address1: string | null
    city: string | null
    region: string | null
    postcode: string | null
  } | null
}

/** Citation Builder campaign from Management API */
export interface CBCampaign {
  campaign_id: number
  location_id: number
  name: string
  lookup_status: 'complete' | 'processing'
  campaigns: Array<{
    campaign_id: string
    status: string
    citations_ordered: number
    citations: Array<{
      domain: string
      status: string
      profile_url: string | null
    }>
  }>
}

// ─── Helpers ────────────────────────────────────────────────

function getApiKey(): string {
  const apiKey = process.env.BRIGHTLOCAL_API_KEY
  if (!apiKey) throw new Error('BRIGHTLOCAL_API_KEY must be set')
  return apiKey
}

function formatErrors(errors: unknown): string {
  if (!errors) return 'unknown error'
  if (Array.isArray(errors)) return errors.join(', ')
  if (typeof errors === 'string') return errors
  return JSON.stringify(errors)
}

// ─── Management API fetch (JSON, x-api-key header) ─────────

async function manageFetch<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: Record<string, unknown>,
  queryParams?: Record<string, string>,
): Promise<T> {
  const apiKey = getApiKey()

  let url = `${MANAGE_BASE}${path}`
  if (queryParams) {
    const qs = new URLSearchParams(queryParams).toString()
    url = `${url}?${qs}`
  }

  const response = await fetch(url, {
    method,
    headers: {
      'x-api-key': apiKey,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`BrightLocal Management API ${method} ${path} failed (${response.status}): ${text}`)
  }

  return response.json()
}

// ─── Legacy CT API fetch (form-encoded, api-key param) ──────

async function legacyFetch<T>(
  path: string,
  method: 'GET' | 'POST',
  params: Record<string, string> = {},
): Promise<LegacyResponse<T>> {
  const apiKey = getApiKey()
  const allParams = { 'api-key': apiKey, ...params }

  let url = `${LEGACY_BASE}${path}`
  let body: string | undefined

  if (method === 'GET') {
    url = `${url}?${new URLSearchParams(allParams).toString()}`
  } else {
    body = new URLSearchParams(allParams).toString()
  }

  const response = await fetch(url, {
    method,
    headers: method !== 'GET' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {},
    body,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`BrightLocal API ${method} ${path} failed (${response.status}): ${text}`)
  }

  return response.json()
}

// ─── Management API: Business Categories ────────────────────

/**
 * Get business categories for a country. Returns the first match for a query,
 * or null if none found. Uses the Management API.
 */
export async function searchBusinessCategory(
  categoryName: string,
  country: string = 'USA',
): Promise<string | null> {
  const res = await manageFetch<{ total_count: number; items: Array<{ id: number; name: string }> }>(
    `/business-categories/${country}`,
    'GET',
  )

  if (!res.items || res.items.length === 0) return null

  // Find best match — exact first, then prefix, then first result
  const lower = categoryName.toLowerCase()
  const exact = res.items.find((c) => c.name.toLowerCase() === lower)
  if (exact) return String(exact.id)

  const prefix = res.items.find((c) => c.name.toLowerCase().startsWith(lower))
  if (prefix) return String(prefix.id)

  // Fall back to first category (the endpoint doesn't support query filtering,
  // it returns all categories for a country)
  return String(res.items[0].id)
}

// ─── Management API: Locations ──────────────────────────────

/**
 * Find a BrightLocal location by reference string.
 * Returns the location_id if found, null otherwise.
 */
export async function findBLLocation(locationReference: string): Promise<string | null> {
  const res = await manageFetch<{ total_count: number; items: BLLocation[] }>(
    '/locations',
    'GET',
    undefined,
    { query: locationReference },
  )

  if (!res.items || res.items.length === 0) return null
  return String(res.items[0].location_id)
}

/**
 * Create a BrightLocal Location via the Management API.
 * Returns the BrightLocal location ID.
 */
export async function createBLLocation(params: {
  name: string
  phone: string
  address1?: string
  city?: string
  region?: string
  postcode?: string
  country: string
  website: string
  businessCategoryId: string
  locationReference: string
}): Promise<string> {
  const body: Record<string, unknown> = {
    business_name: params.name,
    location_reference: params.locationReference,
    country: params.country,
    telephone: params.phone,
    business_category_id: parseInt(params.businessCategoryId, 10),
    address: {
      address1: params.address1 || params.name, // address1 is required
      ...(params.city ? { city: params.city } : {}),
      ...(params.region ? { region: params.region } : {}),
      ...(params.postcode ? { postcode: params.postcode } : {}),
    },
    urls: {
      website_url: params.website,
    },
  }

  const res = await manageFetch<{ location_id: number }>('/locations', 'POST', body)

  if (!res.location_id) {
    throw new Error('Failed to create BL location: no location_id in response')
  }

  return String(res.location_id)
}

/**
 * Get a BrightLocal location by ID.
 */
export async function getBLLocation(locationId: string): Promise<BLLocation> {
  return manageFetch<BLLocation>(`/locations/${locationId}`, 'GET')
}

// ─── Management API: Citation Builder ───────────────────────

/**
 * Create a Citation Builder campaign for a location.
 * Returns the campaign ID.
 */
export async function createCBCampaign(locationId: string): Promise<string> {
  const res = await manageFetch<{ campaign_id: number }>(
    '/citation-builder',
    'POST',
    { location_id: parseInt(locationId, 10) },
  )

  if (!res.campaign_id) {
    throw new Error('Failed to create CB campaign: no campaign_id in response')
  }

  return String(res.campaign_id)
}

/**
 * Get a Citation Builder campaign by ID.
 */
export async function getCBCampaign(campaignId: string): Promise<CBCampaign> {
  return manageFetch<CBCampaign>(`/citation-builder/${campaignId}`, 'GET')
}

/**
 * Find Citation Builder campaigns for a location.
 */
export async function findCBCampaigns(locationId: string): Promise<CBCampaign[]> {
  const res = await manageFetch<{ total_count: number; items: CBCampaign[] }>(
    '/citation-builder',
    'GET',
    undefined,
    { location_id: locationId },
  )

  return res.items || []
}

// ─── Legacy API: Citation Tracker ───────────────────────────

/**
 * Create a Citation Tracker report for a BrightLocal location.
 * Returns the BrightLocal report ID.
 */
export async function createCTReport(params: {
  locationId: string
  businessType: string
  primaryLocation: string
}): Promise<string> {
  const res = await legacyFetch<{ 'report-id': number }>('/v2/ct/add', 'POST', {
    'location-id': params.locationId,
    'business-type': params.businessType,
    'primary-location': params.primaryLocation,
  })

  if (!res.success || !res.response?.['report-id']) {
    throw new Error(`Failed to create CT report: ${formatErrors(res.errors)}`)
  }

  return String(res.response['report-id'])
}

/**
 * Trigger/run a Citation Tracker report scan.
 */
export async function runCTReport(reportId: string): Promise<void> {
  const res = await legacyFetch('/v2/ct/run', 'POST', {
    'report-id': reportId,
  })

  if (!res.success) {
    throw new Error(`Failed to run CT report ${reportId}: ${formatErrors(res.errors)}`)
  }
}

/**
 * Get a Citation Tracker report status.
 */
export async function getCTReport(reportId: string): Promise<CTReportStatus> {
  const res = await legacyFetch<CTReportStatus>('/v2/ct/get', 'GET', {
    'report-id': reportId,
  })

  const report = res.report || res.response
  if (!res.success || !report) {
    throw new Error(`Failed to get CT report ${reportId}: ${formatErrors(res.errors)}`)
  }

  return report
}

/**
 * Get Citation Tracker results (the actual citation listings).
 */
export async function getCTResults(reportId: string): Promise<CTCitation[]> {
  const res = await legacyFetch<CTResultsResponse>('/v2/ct/get-results', 'GET', {
    'report-id': reportId,
  })

  if (!res.success || !res.response) {
    throw new Error(`Failed to get CT results for ${reportId}: ${formatErrors(res.errors)}`)
  }

  const { results } = res.response
  return [
    ...(results.active || []),
    ...(results.pending || []),
    ...(results.possible || []),
  ]
}

/**
 * Delete a Citation Tracker report.
 */
export async function deleteCTReport(reportId: string): Promise<void> {
  await legacyFetch('/v2/ct/delete', 'POST', {
    'report-id': reportId,
  })
}
