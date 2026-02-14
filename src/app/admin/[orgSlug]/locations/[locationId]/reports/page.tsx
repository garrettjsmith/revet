import { getOrgBySlug } from '@/lib/org'
import { createAdminClient } from '@/lib/supabase/admin'
import { LocationReportView } from '@/components/location-report'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function LocationReportPage({
  params,
}: {
  params: Promise<{ orgSlug: string; locationId: string }>
}) {
  const { orgSlug, locationId } = await params
  const org = await getOrgBySlug(orgSlug)
  const adminClient = createAdminClient()

  // Date ranges
  const now = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const sixtyDaysAgo = new Date(now)
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
  const ninetyDaysAgo = new Date(now)
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  // Current month for keyword query
  const keywordMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const kwYear = keywordMonth.getFullYear()
  const kwMonth = keywordMonth.getMonth() + 1

  // Parallel queries
  const [
    locationResult,
    reviewsResult,
    recentReviewsResult,
    gbp90dResult,
    gbpProfileResult,
    allScansResult,
    keywordsResult,
  ] = await Promise.all([
    adminClient
      .from('locations')
      .select('id, name, city, state, type, email, phone, address_line1, intake_data')
      .eq('id', locationId)
      .eq('org_id', org.id)
      .single(),

    // All reviews for this location
    adminClient
      .from('reviews')
      .select('id, rating, published_at, reply_body, sentiment, platform, reviewer_name, body, status')
      .eq('location_id', locationId)
      .order('published_at', { ascending: false }),

    // Recent reviews with full detail (last 10)
    adminClient
      .from('reviews')
      .select('id, rating, published_at, reply_body, sentiment, platform, reviewer_name, reviewer_photo_url, body, status')
      .eq('location_id', locationId)
      .order('published_at', { ascending: false })
      .limit(10),

    // GBP metrics: 90 days for trend charts
    adminClient
      .from('gbp_performance_metrics')
      .select('date, metric, value')
      .eq('location_id', locationId)
      .gte('date', ninetyDaysAgo.toISOString().split('T')[0])
      .lte('date', now.toISOString().split('T')[0])
      .order('date', { ascending: true }),

    adminClient
      .from('gbp_profiles')
      .select('business_name, description, phone_number, website_url, categories, primary_category, address_line1, city, state')
      .eq('location_id', locationId)
      .single(),

    // All LocalFalcon geo-grid scans (for multi-keyword switching + history)
    adminClient
      .from('local_falcon_scans')
      .select('keyword, grid_size, solv, arp, atrp, grid_data, competitors, scanned_at')
      .eq('location_id', locationId)
      .order('scanned_at', { ascending: false }),

    // Search keywords (previous month)
    adminClient
      .from('gbp_search_keywords')
      .select('keyword, impressions, threshold')
      .eq('location_id', locationId)
      .eq('year', kwYear)
      .eq('month', kwMonth)
      .order('impressions', { ascending: false, nullsFirst: false })
      .limit(30),
  ])

  const location = locationResult.data
  if (!location) {
    return (
      <div className="p-8">
        <p className="text-sm text-warm-gray">Location not found.</p>
      </div>
    )
  }

  const reviews = reviewsResult.data || []
  const recentReviews = recentReviewsResult.data || []
  const gbpRaw = gbp90dResult.data || []
  const gbpProfile = gbpProfileResult.data
  const allScans = (allScansResult.data || []) as Array<{
    keyword: string
    grid_size: number
    solv: number | null
    arp: number | null
    atrp: number | null
    grid_data: Array<{ lat: number; lng: number; rank: number }>
    competitors: Array<{ name: string; solv?: number; arp?: number; review_count?: number; rating?: number }>
    scanned_at: string
  }>
  const searchKeywords = (keywordsResult.data || []) as Array<{
    keyword: string
    impressions: number | null
    threshold: number | null
  }>

  // Group scans by keyword — each keyword has its latest scan + SoLV history
  const scansByKeyword: Record<string, typeof allScans> = {}
  for (const scan of allScans) {
    if (!scansByKeyword[scan.keyword]) scansByKeyword[scan.keyword] = []
    scansByKeyword[scan.keyword].push(scan)
  }

  // Build keyword scan list: latest scan per keyword + history for trend
  const keywordScans = Object.entries(scansByKeyword).map(([keyword, scans]) => ({
    keyword,
    latest: scans[0], // already sorted desc by scanned_at
    history: scans.map((s) => ({
      date: s.scanned_at,
      solv: s.solv,
      arp: s.arp,
    })).reverse(), // chronological order for chart
  }))

  // Target keywords from intake form
  const intakeData = location.intake_data as { keywords?: string[] } | null
  const targetKeywords = intakeData?.keywords || []

  // Build daily time series
  const impressionTypes = [
    'impressions_desktop_maps', 'impressions_desktop_search',
    'impressions_mobile_maps', 'impressions_mobile_search',
  ]

  const dailyMap: Record<string, { impressions: number; calls: number; directions: number; clicks: number }> = {}
  for (const row of gbpRaw) {
    if (!dailyMap[row.date]) {
      dailyMap[row.date] = { impressions: 0, calls: 0, directions: 0, clicks: 0 }
    }
    if (impressionTypes.includes(row.metric)) dailyMap[row.date].impressions += row.value
    if (row.metric === 'call_clicks') dailyMap[row.date].calls += row.value
    if (row.metric === 'direction_requests') dailyMap[row.date].directions += row.value
    if (row.metric === 'website_clicks') dailyMap[row.date].clicks += row.value
  }

  const daily = Object.entries(dailyMap)
    .map(([date, v]) => ({ date, ...v, actions: v.calls + v.directions + v.clicks }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Split into current 30d and previous 30d for trends
  const thirtyDayStr = thirtyDaysAgo.toISOString().split('T')[0]
  const current30d = daily.filter((d) => d.date >= thirtyDayStr)
  const prev30d = daily.filter((d) => d.date < thirtyDayStr)

  const sumMetric = (data: typeof daily, key: 'impressions' | 'calls' | 'directions' | 'clicks' | 'actions') =>
    data.reduce((sum, d) => sum + d[key], 0)

  const gbpMetrics = {
    impressions: { value: sumMetric(current30d, 'impressions'), previous: sumMetric(prev30d, 'impressions') },
    calls: { value: sumMetric(current30d, 'calls'), previous: sumMetric(prev30d, 'calls') },
    directions: { value: sumMetric(current30d, 'directions'), previous: sumMetric(prev30d, 'directions') },
    clicks: { value: sumMetric(current30d, 'clicks'), previous: sumMetric(prev30d, 'clicks') },
    actions: { value: sumMetric(current30d, 'actions'), previous: sumMetric(prev30d, 'actions') },
  }

  // Review aggregates
  const totalReviews = reviews.length
  const ratingsOnly = reviews.filter((r) => r.rating != null)
  const avgRating = ratingsOnly.length > 0
    ? Math.round(ratingsOnly.reduce((sum, r) => sum + r.rating!, 0) / ratingsOnly.length * 10) / 10
    : null
  const reviews30d = reviews.filter((r) => new Date(r.published_at) >= thirtyDaysAgo).length
  const repliedCount = reviews.filter((r) => r.reply_body).length
  const responseRate = totalReviews > 0 ? Math.round((repliedCount / totalReviews) * 100) : 0
  const lastReviewDate = reviews[0]?.published_at
  const daysSinceLastReview = lastReviewDate
    ? Math.floor((now.getTime() - new Date(lastReviewDate).getTime()) / 86400000)
    : null

  // Rating distribution
  const ratingDist = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
  }))

  // Sentiment
  const sentimentCounts = {
    positive: reviews.filter((r) => r.sentiment === 'positive').length,
    neutral: reviews.filter((r) => r.sentiment === 'neutral').length,
    negative: reviews.filter((r) => r.sentiment === 'negative').length,
  }

  // Monthly review velocity (last 12 months)
  const reviewVelocity: { month: string; count: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now)
    d.setMonth(d.getMonth() - i)
    const monthStr = d.toISOString().slice(0, 7) // YYYY-MM
    const label = d.toLocaleDateString('en-US', { month: 'short' })
    const count = reviews.filter((r) => r.published_at.startsWith(monthStr)).length
    reviewVelocity.push({ month: label, count })
  }

  // Profile completeness
  const profileFields = gbpProfile ? [
    { label: 'Business Name', filled: !!gbpProfile.business_name },
    { label: 'Description', filled: !!gbpProfile.description },
    { label: 'Phone', filled: !!gbpProfile.phone_number },
    { label: 'Website', filled: !!gbpProfile.website_url },
    { label: 'Categories', filled: !!gbpProfile.categories },
    { label: 'Address', filled: !!gbpProfile.address_line1 },
  ] : []

  const profileComplete = profileFields.filter((f) => f.filled).length
  const profileTotal = profileFields.length

  // Platform breakdown
  const platformCounts: Record<string, number> = {}
  for (const r of reviews) {
    platformCounts[r.platform] = (platformCounts[r.platform] || 0) + 1
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px]">
      <div className="mb-6">
        <Link
          href={`/admin/${orgSlug}/reports`}
          className="text-[10px] text-warm-gray hover:text-ink transition-colors no-underline uppercase tracking-wider"
        >
          Reports
        </Link>
        <h1 className="text-xl font-serif text-ink mt-1">{location.name}</h1>
        <p className="text-xs text-warm-gray mt-0.5">
          {[location.city, location.state].filter(Boolean).join(', ')} · Last 90 days
        </p>
      </div>

      <LocationReportView
        orgSlug={orgSlug}
        locationId={locationId}
        gbpMetrics={gbpMetrics}
        daily={daily}
        avgRating={avgRating}
        totalReviews={totalReviews}
        reviews30d={reviews30d}
        responseRate={responseRate}
        daysSinceLastReview={daysSinceLastReview}
        ratingDist={ratingDist}
        sentimentCounts={sentimentCounts}
        reviewVelocity={reviewVelocity}
        recentReviews={recentReviews}
        profileFields={profileFields}
        profileComplete={profileComplete}
        profileTotal={profileTotal}
        platformCounts={platformCounts}
        keywordScans={keywordScans}
        searchKeywords={searchKeywords}
        targetKeywords={targetKeywords}
      />
    </div>
  )
}
