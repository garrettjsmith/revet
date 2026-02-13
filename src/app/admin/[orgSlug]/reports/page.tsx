import { getOrgBySlug } from '@/lib/org'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAgencyAdmin } from '@/lib/locations'
import { OrgReportDashboard } from '@/components/org-report-dashboard'

export const dynamic = 'force-dynamic'

interface LocationReport {
  id: string
  name: string
  city: string | null
  state: string | null
  type: string
  avg_rating: number | null
  total_reviews: number
  reviews_30d: number
  replied_count: number
  response_rate: number
  days_since_last_review: number | null
  gbp_actions_30d: number
  gbp_actions_trend: number
  gbp_impressions_30d: number
  health: 'healthy' | 'attention' | 'at_risk'
}

export default async function OrgReportsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const org = await getOrgBySlug(orgSlug)
  const adminClient = createAdminClient()

  // Get all active locations for this org
  const { data: locations } = await adminClient
    .from('locations')
    .select('id, name, city, state, type')
    .eq('org_id', org.id)
    .eq('active', true)
    .order('name')

  if (!locations || locations.length === 0) {
    return (
      <div className="p-8">
        <h1 className="text-lg font-serif text-ink mb-2">Reports</h1>
        <p className="text-sm text-warm-gray">No active locations found. Add locations to see reports.</p>
      </div>
    )
  }

  const locationIds = locations.map((l) => l.id)

  // Date ranges
  const now = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const sixtyDaysAgo = new Date(now)
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

  // Parallel queries for all location data
  const [reviewsResult, gbpCurrentResult, gbpPrevResult, gbpProfilesResult] = await Promise.all([
    // Reviews: all reviews for these locations (we'll aggregate in JS)
    adminClient
      .from('reviews')
      .select('location_id, rating, published_at, reply_body, sentiment')
      .in('location_id', locationIds)
      .order('published_at', { ascending: false }),

    // GBP metrics: current 30d
    adminClient
      .from('gbp_performance_metrics')
      .select('location_id, metric, value')
      .in('location_id', locationIds)
      .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
      .lte('date', now.toISOString().split('T')[0]),

    // GBP metrics: previous 30d (for trend)
    adminClient
      .from('gbp_performance_metrics')
      .select('location_id, metric, value')
      .in('location_id', locationIds)
      .gte('date', sixtyDaysAgo.toISOString().split('T')[0])
      .lt('date', thirtyDaysAgo.toISOString().split('T')[0]),

    // GBP profiles: completeness check
    adminClient
      .from('gbp_profiles')
      .select('location_id, business_name, description, phone_number, website_url, categories, has_google_updated')
      .in('location_id', locationIds),
  ])

  const reviews = reviewsResult.data || []
  const gbpCurrent = gbpCurrentResult.data || []
  const gbpPrev = gbpPrevResult.data || []
  const gbpProfiles = gbpProfilesResult.data || []

  // Also fetch daily aggregate for the chart
  const { data: dailyRaw } = await adminClient
    .from('gbp_performance_metrics')
    .select('date, metric, value')
    .in('location_id', locationIds)
    .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
    .lte('date', now.toISOString().split('T')[0])
    .order('date', { ascending: true })

  // Build daily time series (aggregated across all locations)
  const impressionTypes = [
    'impressions_desktop_maps', 'impressions_desktop_search',
    'impressions_mobile_maps', 'impressions_mobile_search',
  ]
  const actionTypes = ['website_clicks', 'call_clicks', 'direction_requests']

  const dailyMap: Record<string, { impressions: number; actions: number; calls: number; directions: number; clicks: number }> = {}
  for (const row of dailyRaw || []) {
    if (!dailyMap[row.date]) {
      dailyMap[row.date] = { impressions: 0, actions: 0, calls: 0, directions: 0, clicks: 0 }
    }
    if (impressionTypes.includes(row.metric)) {
      dailyMap[row.date].impressions += row.value
    }
    if (actionTypes.includes(row.metric)) {
      dailyMap[row.date].actions += row.value
    }
    if (row.metric === 'call_clicks') dailyMap[row.date].calls += row.value
    if (row.metric === 'direction_requests') dailyMap[row.date].directions += row.value
    if (row.metric === 'website_clicks') dailyMap[row.date].clicks += row.value
  }

  const daily = Object.entries(dailyMap)
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Aggregate review data per location
  const reviewsByLoc: Record<string, typeof reviews> = {}
  for (const r of reviews) {
    if (!reviewsByLoc[r.location_id]) reviewsByLoc[r.location_id] = []
    reviewsByLoc[r.location_id].push(r)
  }

  // Aggregate GBP metrics per location
  const gbpCurrentByLoc: Record<string, Record<string, number>> = {}
  for (const row of gbpCurrent) {
    if (!gbpCurrentByLoc[row.location_id]) gbpCurrentByLoc[row.location_id] = {}
    gbpCurrentByLoc[row.location_id][row.metric] = (gbpCurrentByLoc[row.location_id][row.metric] || 0) + row.value
  }

  const gbpPrevByLoc: Record<string, Record<string, number>> = {}
  for (const row of gbpPrev) {
    if (!gbpPrevByLoc[row.location_id]) gbpPrevByLoc[row.location_id] = {}
    gbpPrevByLoc[row.location_id][row.metric] = (gbpPrevByLoc[row.location_id][row.metric] || 0) + row.value
  }

  // GBP profiles by location
  const profileByLoc: Record<string, (typeof gbpProfiles)[0]> = {}
  for (const p of gbpProfiles) {
    profileByLoc[p.location_id] = p
  }

  // Build per-location reports
  const locationReports: LocationReport[] = locations.map((loc) => {
    const locReviews = reviewsByLoc[loc.id] || []
    const totalReviews = locReviews.length
    const avgRating = totalReviews > 0
      ? locReviews.reduce((sum, r) => sum + (r.rating || 0), 0) / locReviews.filter((r) => r.rating != null).length
      : null
    const reviews30d = locReviews.filter((r) => new Date(r.published_at) >= thirtyDaysAgo).length
    const repliedCount = locReviews.filter((r) => r.reply_body).length
    const responseRate = totalReviews > 0 ? Math.round((repliedCount / totalReviews) * 100) : 0
    const lastReviewDate = locReviews[0]?.published_at
    const daysSinceLastReview = lastReviewDate
      ? Math.floor((now.getTime() - new Date(lastReviewDate).getTime()) / 86400000)
      : null

    // GBP actions
    const curMetrics = gbpCurrentByLoc[loc.id] || {}
    const prevMetrics = gbpPrevByLoc[loc.id] || {}
    const curActions = (curMetrics['website_clicks'] || 0) + (curMetrics['call_clicks'] || 0) + (curMetrics['direction_requests'] || 0)
    const prevActions = (prevMetrics['website_clicks'] || 0) + (prevMetrics['call_clicks'] || 0) + (prevMetrics['direction_requests'] || 0)
    const actionsTrend = prevActions > 0 ? Math.round(((curActions - prevActions) / prevActions) * 100) : 0
    const curImpressions = impressionTypes.reduce((sum, m) => sum + (curMetrics[m] || 0), 0)

    // Health score
    let health: 'healthy' | 'attention' | 'at_risk' = 'healthy'
    if (avgRating !== null && avgRating < 3.0) health = 'at_risk'
    else if (avgRating !== null && avgRating < 4.0) health = 'attention'
    if (daysSinceLastReview !== null && daysSinceLastReview > 60) health = 'at_risk'
    else if (daysSinceLastReview !== null && daysSinceLastReview > 30 && health !== 'at_risk') health = 'attention'
    if (actionsTrend < -30) health = 'at_risk'
    else if (actionsTrend < -10 && health === 'healthy') health = 'attention'

    return {
      id: loc.id,
      name: loc.name,
      city: loc.city,
      state: loc.state,
      type: loc.type,
      avg_rating: avgRating !== null ? Math.round(avgRating * 10) / 10 : null,
      total_reviews: totalReviews,
      reviews_30d: reviews30d,
      replied_count: repliedCount,
      response_rate: responseRate,
      days_since_last_review: daysSinceLastReview,
      gbp_actions_30d: curActions,
      gbp_actions_trend: actionsTrend,
      gbp_impressions_30d: curImpressions,
      health,
    }
  })

  // Build summary
  const locationsWithRating = locationReports.filter((l) => l.avg_rating !== null)
  const avgRatingOverall = locationsWithRating.length > 0
    ? Math.round(locationsWithRating.reduce((sum, l) => sum + l.avg_rating!, 0) / locationsWithRating.length * 10) / 10
    : null
  const totalReviewsAll = locationReports.reduce((sum, l) => sum + l.total_reviews, 0)
  const reviews30dAll = locationReports.reduce((sum, l) => sum + l.reviews_30d, 0)
  const totalReplied = locationReports.reduce((sum, l) => sum + l.replied_count, 0)
  const totalGbpActions = locationReports.reduce((sum, l) => sum + l.gbp_actions_30d, 0)
  const totalGbpActionsPrev = locationReports.reduce((sum, l) => {
    const prev = gbpPrevByLoc[l.id] || {}
    return sum + (prev['website_clicks'] || 0) + (prev['call_clicks'] || 0) + (prev['direction_requests'] || 0)
  }, 0)
  const gbpActionsTrend = totalGbpActionsPrev > 0
    ? Math.round(((totalGbpActions - totalGbpActionsPrev) / totalGbpActionsPrev) * 100)
    : 0
  const totalImpressions = locationReports.reduce((sum, l) => sum + l.gbp_impressions_30d, 0)

  const summary = {
    total_locations: locations.length,
    avg_rating: avgRatingOverall,
    total_reviews: totalReviewsAll,
    reviews_30d: reviews30dAll,
    response_rate: totalReviewsAll > 0 ? Math.round((totalReplied / totalReviewsAll) * 100) : 0,
    total_gbp_actions: totalGbpActions,
    gbp_actions_trend: gbpActionsTrend,
    total_impressions: totalImpressions,
    locations_healthy: locationReports.filter((l) => l.health === 'healthy').length,
    locations_attention: locationReports.filter((l) => l.health === 'attention').length,
    locations_at_risk: locationReports.filter((l) => l.health === 'at_risk').length,
  }

  // Sentiment breakdown
  const sentimentCounts = {
    positive: reviews.filter((r) => r.sentiment === 'positive').length,
    neutral: reviews.filter((r) => r.sentiment === 'neutral').length,
    negative: reviews.filter((r) => r.sentiment === 'negative').length,
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px]">
      <div className="mb-8">
        <h1 className="text-xl font-serif text-ink">Reports</h1>
        <p className="text-xs text-warm-gray mt-1">
          {org.name} · Last 30 days
        </p>
      </div>

      <OrgReportDashboard
        orgSlug={orgSlug}
        summary={summary}
        sentimentCounts={sentimentCounts}
        locations={locationReports}
        daily={daily}
      />
    </div>
  )
}
