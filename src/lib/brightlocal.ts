const BASE_URL = 'https://tools.brightlocal.com/seo-tools/api'

interface BrightLocalResponse<T = unknown> {
  success: boolean
  errors?: unknown
  response?: T
  // /v2/ct/get returns report at top level, not nested under response
  report?: T
}

interface CTReportStatus {
  report_id: string
  report_name: string
  status: string
}

/** Shape returned by /v2/ct/get-results — results grouped by status */
interface CTResultsResponse {
  results: {
    active?: CTCitation[]
    pending?: CTCitation[]
    possible?: CTCitation[]
  }
}

/**
 * Citation fields from BrightLocal use hyphenated keys.
 * We normalize to underscore on read.
 */
export interface CTCitation {
  citation_id: number
  source: string
  url: string | null
  'citation-status': string // 'active' | 'pending' | 'possible'
  status: string // 'Got it' etc.
  'domain-authority': string | null
  'site-type': string | null
  'listing-type': string | null
  'business-name': string | null
  address: string | null
  postcode: string | null
  telephone: string | null
  'date-identified': string | null
}

function formatErrors(errors: unknown): string {
  if (!errors) return 'unknown error'
  if (Array.isArray(errors)) return errors.join(', ')
  if (typeof errors === 'string') return errors
  return JSON.stringify(errors)
}

function getApiKey(): string {
  const apiKey = process.env.BRIGHTLOCAL_API_KEY
  if (!apiKey) {
    throw new Error('BRIGHTLOCAL_API_KEY must be set')
  }
  return apiKey
}

async function blFetch<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  params: Record<string, string> = {}
): Promise<BrightLocalResponse<T>> {
  const apiKey = getApiKey()

  const allParams = {
    'api-key': apiKey,
    ...params,
  }

  let url = `${BASE_URL}${path}`
  let body: string | undefined

  if (method === 'GET') {
    const qs = new URLSearchParams(allParams).toString()
    url = `${url}?${qs}`
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

// ─── Locations API ──────────────────────────────────────────

/**
 * Create a BrightLocal Location. This holds the NAP data that
 * Citation Tracker reports reference via location-id.
 * Returns the BrightLocal location ID.
 */
export async function createBLLocation(params: {
  name: string
  phone: string
  address1?: string
  city: string
  region: string
  postcode: string
  country: string
  website: string
  businessCategoryId: string
  locationReference?: string
}): Promise<string> {
  const postParams: Record<string, string> = {
    name: params.name,
    telephone: params.phone,
    city: params.city,
    region: params.region,
    postcode: params.postcode,
    country: params.country,
    url: params.website,
    'business-category-id': params.businessCategoryId,
  }
  if (params.address1) postParams['address1'] = params.address1
  if (params.locationReference) postParams['location-reference'] = params.locationReference

  const res = await blFetch<{ 'location-id': number }>(
    '/v2/clients-and-locations/locations/',
    'POST',
    postParams
  )

  if (!res.success || !res.response?.['location-id']) {
    throw new Error(`Failed to create BL location: ${formatErrors(res.errors)}`)
  }

  return String(res.response['location-id'])
}

/**
 * Search BrightLocal business categories by name for a given country.
 * Returns the first matching category ID, or null if none found.
 */
export async function searchBusinessCategory(
  categoryName: string,
  country: string = 'USA'
): Promise<string | null> {
  const res = await blFetch<Array<{ id: number; name: string }>>(
    '/v2/clients-and-locations/business-categories',
    'GET',
    { country, q: categoryName }
  )

  if (!res.success || !res.response || res.response.length === 0) {
    return null
  }

  return String(res.response[0].id)
}

// ─── Citation Tracker API ───────────────────────────────────

/**
 * Create a Citation Tracker report for a BrightLocal location.
 * Requires a location-id (from createBLLocation), business-type,
 * and primary-location (ZIP code for competitor lookup).
 * Returns the BrightLocal report ID.
 */
export async function createCTReport(params: {
  locationId: string
  businessType: string
  primaryLocation: string
}): Promise<string> {
  const res = await blFetch<{ 'report-id': number }>('/v2/ct/add', 'POST', {
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
  const res = await blFetch('/v2/ct/run', 'POST', {
    'report-id': reportId,
  })

  if (!res.success) {
    throw new Error(`Failed to run CT report ${reportId}: ${formatErrors(res.errors)}`)
  }
}

/**
 * Get a Citation Tracker report status.
 * Note: BrightLocal returns the report under a top-level "report" key,
 * not under "response".
 */
export async function getCTReport(reportId: string): Promise<CTReportStatus> {
  const res = await blFetch<CTReportStatus>('/v2/ct/get', 'GET', {
    'report-id': reportId,
  })

  // BrightLocal returns { success: true, report: { ... } }
  const report = res.report || res.response
  if (!res.success || !report) {
    throw new Error(`Failed to get CT report ${reportId}: ${formatErrors(res.errors)}`)
  }

  return report
}

/**
 * Get Citation Tracker results (the actual citation listings).
 * BrightLocal returns results grouped as active/pending/possible arrays.
 * We merge active citations into a single flat list.
 */
export async function getCTResults(reportId: string): Promise<CTCitation[]> {
  const res = await blFetch<CTResultsResponse>('/v2/ct/get-results', 'GET', {
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
  await blFetch('/v2/ct/delete', 'DELETE', {
    'report-id': reportId,
  })
}
