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

// BL legacy API has inconsistent response shapes across endpoints.
// Some return {success, report}, some return {response: {results}},
// ct/add returns flat {status, report-id}. We type as any and
// handle each shape in the calling function.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LegacyResponse = Record<string, any>

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

async function legacyFetch(
  path: string,
  method: 'GET' | 'POST',
  params: Record<string, string> = {},
): Promise<LegacyResponse> {
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

// ─── US state abbreviation → full name mapping ─────────────

const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia', PR: 'Puerto Rico', VI: 'Virgin Islands', GU: 'Guam',
  AS: 'American Samoa', MP: 'Northern Mariana Islands',
}

/** Resolve a state value to { region, region_code } for the Management API */
function resolveRegion(state: string): { region?: string; region_code?: string } {
  const trimmed = state.trim()
  const upper = trimmed.toUpperCase()

  // Check if it's a known abbreviation
  if (US_STATES[upper]) {
    return { region: US_STATES[upper], region_code: upper }
  }

  // Check if it's a full state name — reverse lookup for the code
  const entry = Object.entries(US_STATES).find(
    ([, name]) => name.toLowerCase() === trimmed.toLowerCase()
  )
  if (entry) {
    return { region: entry[1], region_code: entry[0] }
  }

  // Unknown — pass through as region (handles non-US states)
  return { region: trimmed }
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
  const regionFields = params.region ? resolveRegion(params.region) : {}

  const body: Record<string, unknown> = {
    business_name: params.name,
    location_reference: params.locationReference,
    country: params.country,
    telephone: params.phone,
    business_category_id: parseInt(params.businessCategoryId, 10),
    address: {
      address1: params.address1 || params.name, // address1 is required
      ...(params.city ? { city: params.city } : {}),
      ...regionFields,
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
 * Find existing CT reports for a BrightLocal location.
 * Returns the first report ID if any exist, null otherwise.
 */
export async function findExistingCTReport(locationId: string): Promise<string | null> {
  const res = await legacyFetch('/v2/ct/get-all', 'GET', {
    'location-id': locationId,
  })

  // Response shape: {"response":{"results":[{report_id, location_id, ...}]}}
  const results = res.response?.results
  if (!Array.isArray(results) || results.length === 0) return null

  return String(results[0].report_id)
}

/**
 * Create a Citation Tracker report for a BrightLocal location.
 * Returns the BrightLocal report ID.
 */
export async function createCTReport(params: {
  locationId: string
  businessType: string
  primaryLocation: string
}): Promise<string> {
  const res = await legacyFetch('/v2/ct/add', 'POST', {
    'location-id': params.locationId,
    'business-type': params.businessType,
    'primary-location': params.primaryLocation,
  })

  // Response shape varies: {"response":{"status":"added","report-id":N}}
  // or flat {"status":"added","report-id":N}
  const reportId = res.response?.['report-id'] ?? res['report-id']
  if (!reportId) {
    throw new Error(`Failed to create CT report: ${formatErrors(res.errors)} | full response: ${JSON.stringify(res)}`)
  }

  return String(reportId)
}

/**
 * Trigger/run a Citation Tracker report scan.
 */
export async function runCTReport(reportId: string): Promise<void> {
  const res = await legacyFetch('/v2/ct/run', 'POST', {
    'report-id': reportId,
  })

  // Response shape: {"response":{"status":"running"}}
  const status = res.response?.status ?? res.status
  if (status !== 'running' && !res.success) {
    throw new Error(`Failed to run CT report ${reportId}: ${formatErrors(res.errors)} | full response: ${JSON.stringify(res)}`)
  }
}

/**
 * Get a Citation Tracker report status.
 */
export async function getCTReport(reportId: string): Promise<CTReportStatus> {
  const res = await legacyFetch('/v2/ct/get', 'GET', {
    'report-id': reportId,
  })

  // Response shape: {"success":true,"report":{...}}
  const report = res.report || res.response
  if (!report) {
    throw new Error(`Failed to get CT report ${reportId}: ${formatErrors(res.errors)} | full response: ${JSON.stringify(res)}`)
  }

  return report as CTReportStatus
}

/**
 * Get Citation Tracker results (the actual citation listings).
 */
export async function getCTResults(reportId: string): Promise<CTCitation[]> {
  const res = await legacyFetch('/v2/ct/get-results', 'GET', {
    'report-id': reportId,
  })

  // Response shape: {"response":{"results":{"active":[],"pending":[],"possible":[]}}}
  const results = res.response?.results
  if (!results) {
    throw new Error(`Failed to get CT results for ${reportId}: ${formatErrors(res.errors)} | full response: ${JSON.stringify(res)}`)
  }

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
