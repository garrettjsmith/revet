const BASE_URL = 'https://api.localfalcon.com/v1'

interface ScanReportRaw {
  report_key: string
  keyword: string
  place_id: string
  grid_size: number
  radius: number
  solv: number
  arp: number
  atrp: number
  grid_points: Array<{
    lat: number
    lng: number
    rank: number
  }>
  competitors?: Array<{
    name: string
    place_id: string
    solv?: number
    arp?: number
    atrp?: number
    review_count?: number
    rating?: number
  }>
  scanned_at: string
}

interface ScanListItem {
  report_key: string
  keyword: string
  place_id: string
  scanned_at: string
}

/**
 * Fetch scan reports from LocalFalcon's Data Retrieval API.
 * Uses the API key stored in the LOCALFALCON_API_KEY env var.
 */
async function localFalconFetch(path: string): Promise<Response> {
  const apiKey = process.env.LOCALFALCON_API_KEY
  if (!apiKey) throw new Error('LOCALFALCON_API_KEY not configured')

  return fetch(`${BASE_URL}${path}`, {
    headers: { api_key: apiKey },
  })
}

/**
 * List all scan reports, optionally filtered by place_id.
 */
export async function listScanReports(placeId?: string): Promise<ScanListItem[]> {
  const path = placeId ? `/reports?place_id=${encodeURIComponent(placeId)}` : '/reports'
  const res = await localFalconFetch(path)
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`LocalFalcon list reports failed: ${res.status} ${err}`)
  }
  const data = await res.json()
  return data.reports || data || []
}

/**
 * Get a specific scan report by report key.
 */
export async function getScanReport(reportKey: string): Promise<ScanReportRaw> {
  const res = await localFalconFetch(`/report/${reportKey}`)
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`LocalFalcon get report failed: ${res.status} ${err}`)
  }
  return res.json()
}

/**
 * Get trend data for a location+keyword pair.
 */
export async function getTrendReport(placeId: string, keyword: string) {
  const params = new URLSearchParams({ place_id: placeId, keyword })
  const res = await localFalconFetch(`/trend-reports?${params}`)
  if (!res.ok) return null
  return res.json()
}

/**
 * Format a raw scan report into the shape we store in our DB.
 */
export function formatScanForDb(report: ScanReportRaw, locationId: string) {
  return {
    location_id: locationId,
    report_key: report.report_key,
    keyword: report.keyword,
    grid_size: report.grid_size,
    radius_km: report.radius,
    solv: report.solv,
    arp: report.arp,
    atrp: report.atrp,
    grid_data: report.grid_points || [],
    competitors: (report.competitors || []).slice(0, 10),
    scanned_at: report.scanned_at,
  }
}
