import { googleFetch } from './auth'

const PERFORMANCE_API = 'https://businessprofileperformance.googleapis.com/v1'

/**
 * Available daily metrics from the Business Profile Performance API.
 */
export const GBP_METRICS = [
  'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
  'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
  'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
  'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
  'WEBSITE_CLICKS',
  'CALL_CLICKS',
  'BUSINESS_DIRECTION_REQUESTS',
  'BUSINESS_BOOKINGS',
  'BUSINESS_CONVERSATIONS',
  'BUSINESS_FOOD_ORDERS',
] as const

/** Metric names we store in our DB (simplified from Google's verbose names) */
export const METRIC_DB_MAP: Record<string, string> = {
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: 'impressions_desktop_maps',
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: 'impressions_desktop_search',
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: 'impressions_mobile_maps',
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: 'impressions_mobile_search',
  WEBSITE_CLICKS: 'website_clicks',
  CALL_CLICKS: 'call_clicks',
  BUSINESS_DIRECTION_REQUESTS: 'direction_requests',
  BUSINESS_BOOKINGS: 'bookings',
  BUSINESS_CONVERSATIONS: 'conversations',
  BUSINESS_FOOD_ORDERS: 'food_orders',
}

interface DailyMetricTimeSeries {
  dailyMetric: string
  timeSeries?: {
    datedValues?: Array<{
      date: { year: number; month: number; day: number }
      value?: string
    }>
  }
}

interface MultiDailyMetricResponse {
  multiDailyMetricTimeSeries?: DailyMetricTimeSeries[]
}

/**
 * Fetch daily performance metrics for a GBP location.
 *
 * @param locationName - Just the location part, e.g. "locations/abc123"
 * @param startDate - YYYY-MM-DD
 * @param endDate - YYYY-MM-DD
 */
export async function fetchPerformanceMetrics(
  locationName: string,
  startDate: string,
  endDate: string
): Promise<Array<{ date: string; metric: string; value: number }>> {
  const params = new URLSearchParams({
    'dailyRange.startDate.year': startDate.split('-')[0],
    'dailyRange.startDate.month': startDate.split('-')[1],
    'dailyRange.startDate.day': startDate.split('-')[2],
    'dailyRange.endDate.year': endDate.split('-')[0],
    'dailyRange.endDate.month': endDate.split('-')[1],
    'dailyRange.endDate.day': endDate.split('-')[2],
  })

  // Add all metrics
  for (const metric of GBP_METRICS) {
    params.append('dailyMetrics', metric)
  }

  const response = await googleFetch(
    `${PERFORMANCE_API}/${locationName}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Failed to fetch performance metrics: ${response.status} ${JSON.stringify(err)}`)
  }

  const data: MultiDailyMetricResponse = await response.json()
  const rows: Array<{ date: string; metric: string; value: number }> = []

  for (const series of data.multiDailyMetricTimeSeries || []) {
    const metricName = METRIC_DB_MAP[series.dailyMetric] || series.dailyMetric
    for (const dv of series.timeSeries?.datedValues || []) {
      if (!dv.value) continue
      const dateStr = `${dv.date.year}-${String(dv.date.month).padStart(2, '0')}-${String(dv.date.day).padStart(2, '0')}`
      rows.push({
        date: dateStr,
        metric: metricName,
        value: parseInt(dv.value, 10),
      })
    }
  }

  return rows
}

/**
 * Fetch search keyword impressions for a GBP location (monthly).
 *
 * Google returns keyword data at monthly granularity. Request one month
 * at a time to get per-month breakdowns. Data older than ~18 months
 * is unavailable — sync regularly to build a long-term history.
 *
 * @param locationName - e.g. "locations/abc123"
 * @param year - e.g. 2026
 * @param month - 1-12
 */
export async function fetchSearchKeywords(
  locationName: string,
  year: number,
  month: number
): Promise<Array<{ keyword: string; impressions: number | null; threshold: number | null }>> {
  const allKeywords: Array<{ keyword: string; impressions: number | null; threshold: number | null }> = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      'monthlyRange.startMonth.year': String(year),
      'monthlyRange.startMonth.month': String(month),
      'monthlyRange.endMonth.year': String(year),
      'monthlyRange.endMonth.month': String(month),
    })
    if (pageToken) params.set('pageToken', pageToken)

    const response = await googleFetch(
      `${PERFORMANCE_API}/${locationName}/searchkeywords/impressions/monthly?${params}`
    )

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`Failed to fetch search keywords: ${response.status} ${JSON.stringify(err)}`)
    }

    const data = await response.json()

    for (const entry of data.searchKeywordsCounts || []) {
      allKeywords.push({
        keyword: entry.searchKeyword,
        impressions: entry.insightsValue?.value ? parseInt(entry.insightsValue.value, 10) : null,
        threshold: entry.insightsValue?.threshold ? parseInt(entry.insightsValue.threshold, 10) : null,
      })
    }

    pageToken = data.nextPageToken
  } while (pageToken)

  return allKeywords
}
