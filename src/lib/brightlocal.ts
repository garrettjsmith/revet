import crypto from 'crypto'

const BASE_URL = 'https://tools.brightlocal.com/seo-tools/api'

interface BrightLocalResponse<T = unknown> {
  success: boolean
  errors?: string[]
  response?: T
}

interface CTReport {
  report_id: string
  report_name: string
  status: string
}

interface CTResult {
  citation_results: CTCitation[]
  report_status: string
}

export interface CTCitation {
  site_name: string
  site_url: string | null
  listing_url: string | null
  nap_correct: boolean
  name_found: string | null
  address_found: string | null
  phone_found: string | null
  name_match: boolean
  address_match: boolean
  phone_match: boolean
  status: string // 'live' | 'not_found' etc.
}

function getAuth(): { apiKey: string; sig: string; expires: number } {
  const apiKey = process.env.BRIGHTLOCAL_API_KEY
  const apiSecret = process.env.BRIGHTLOCAL_API_SECRET
  if (!apiKey || !apiSecret) {
    throw new Error('BRIGHTLOCAL_API_KEY and BRIGHTLOCAL_API_SECRET must be set')
  }

  const expires = Math.floor(Date.now() / 1000) + 1800 // 30 min
  const sig = crypto
    .createHash('sha1')
    .update(apiKey + apiSecret + expires)
    .digest('hex')

  return { apiKey, sig, expires }
}

async function blFetch<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  params: Record<string, string> = {}
): Promise<BrightLocalResponse<T>> {
  const { apiKey, sig, expires } = getAuth()

  const allParams = {
    'api-key': apiKey,
    sig,
    expires: String(expires),
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

/**
 * Create a Citation Tracker report for a location.
 * Returns the BrightLocal report ID.
 */
export async function createCTReport(params: {
  reportName: string
  businessName: string
  phone: string
  address: string
  city: string
  state: string
  postcode: string
  country?: string
}): Promise<string> {
  const res = await blFetch<{ report_id: string }>('/v2/ct/add', 'POST', {
    'report-name': params.reportName,
    'business-names': JSON.stringify([params.businessName]),
    phone: params.phone,
    address1: params.address,
    city: params.city,
    state: params.state,
    postcode: params.postcode,
    country: params.country || 'USA',
  })

  if (!res.success || !res.response?.report_id) {
    throw new Error(`Failed to create CT report: ${res.errors?.join(', ') || 'unknown error'}`)
  }

  return String(res.response.report_id)
}

/**
 * Trigger/run a Citation Tracker report scan.
 */
export async function runCTReport(reportId: string): Promise<void> {
  const res = await blFetch('/v2/ct/run', 'POST', {
    'report-id': reportId,
  })

  if (!res.success) {
    throw new Error(`Failed to run CT report ${reportId}: ${res.errors?.join(', ') || 'unknown error'}`)
  }
}

/**
 * Get a Citation Tracker report status.
 */
export async function getCTReport(reportId: string): Promise<CTReport> {
  const res = await blFetch<CTReport>('/v2/ct/get', 'GET', {
    'report-id': reportId,
  })

  if (!res.success || !res.response) {
    throw new Error(`Failed to get CT report ${reportId}: ${res.errors?.join(', ') || 'unknown error'}`)
  }

  return res.response
}

/**
 * Get Citation Tracker results (the actual citation listings).
 */
export async function getCTResults(reportId: string): Promise<CTCitation[]> {
  const res = await blFetch<CTResult>('/v2/ct/get-results', 'GET', {
    'report-id': reportId,
  })

  if (!res.success || !res.response) {
    throw new Error(`Failed to get CT results for ${reportId}: ${res.errors?.join(', ') || 'unknown error'}`)
  }

  return res.response.citation_results || []
}

/**
 * Delete a Citation Tracker report.
 */
export async function deleteCTReport(reportId: string): Promise<void> {
  await blFetch('/v2/ct/delete', 'DELETE', {
    'report-id': reportId,
  })
}
