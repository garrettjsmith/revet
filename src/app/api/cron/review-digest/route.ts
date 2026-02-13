import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, buildReviewDigestEmail } from '@/lib/email'

export const maxDuration = 120

/**
 * GET /api/cron/review-digest
 *
 * Daily cron that sends a review summary email for each org
 * that received reviews in the last 24 hours.
 *
 * Recipients: org-wide new_review subscribers (via notification_subscriptions).
 * Schedule: Daily at 14:00 UTC (9am ET / 6am PT).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const apiKey = process.env.REVIEW_SYNC_API_KEY

  if (apiKey && authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  // Get all reviews created in the last 24h
  const { data: recentReviews } = await supabase
    .from('reviews')
    .select('id, location_id, platform, reviewer_name, rating, body, reply_body, published_at, sentiment, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  if (!recentReviews || recentReviews.length === 0) {
    return NextResponse.json({ ok: true, message: 'No reviews to digest', sent: 0 })
  }

  // Get location + org info for all reviewed locations
  const locationIdSet = new Set<string>()
  for (const r of recentReviews) locationIdSet.add(r.location_id)
  const locationIds = Array.from(locationIdSet)

  const { data: locations } = await supabase
    .from('locations')
    .select('id, name, org_id, organizations(id, name, slug)')
    .in('id', locationIds)

  if (!locations || locations.length === 0) {
    return NextResponse.json({ ok: true, message: 'No locations found', sent: 0 })
  }

  const locationMap = new Map(locations.map((l: any) => [l.id, l]))

  // Group reviews by org
  const orgMap = new Map<string, {
    orgName: string
    reviews: typeof recentReviews
    locationIds: string[]
  }>()

  for (const review of recentReviews) {
    const location = locationMap.get(review.location_id) as any
    if (!location) continue
    const org = location.organizations
    if (!org) continue

    if (!orgMap.has(org.id)) {
      orgMap.set(org.id, { orgName: org.name, reviews: [], locationIds: [] })
    }
    const entry = orgMap.get(org.id)!
    entry.reviews.push(review)
    if (!entry.locationIds.includes(review.location_id)) {
      entry.locationIds.push(review.location_id)
    }
  }

  let sentCount = 0

  const orgEntries = Array.from(orgMap.entries())
  for (const [orgId, { orgName, reviews, locationIds: orgLocationIds }] of orgEntries) {
    // Get subscriber emails — union across all locations that had reviews
    const allEmails = new Set<string>()
    for (const locId of orgLocationIds) {
      const { data: emails } = await supabase.rpc('get_subscription_emails', {
        p_org_id: orgId,
        p_location_id: locId,
        p_alert_type: 'new_review',
      })
      for (const row of emails || []) {
        allEmails.add((row as any).email)
      }
    }

    if (allEmails.size === 0) continue

    // Compute stats
    const totalReviews = reviews.length
    const ratings = reviews.map((r: any) => r.rating).filter((r: any): r is number => r !== null)
    const avgRating = ratings.length > 0 ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : null
    const positiveCount = reviews.filter((r: any) => r.sentiment === 'positive').length
    const neutralCount = reviews.filter((r: any) => r.sentiment === 'neutral').length
    const negativeCount = reviews.filter((r: any) => r.sentiment === 'negative').length

    // Per-location breakdown
    const locStats = new Map<string, { name: string; count: number; ratings: number[] }>()
    for (const review of reviews) {
      const loc = locationMap.get(review.location_id) as any
      if (!loc) continue
      if (!locStats.has(loc.id)) {
        locStats.set(loc.id, { name: loc.name, count: 0, ratings: [] })
      }
      const s = locStats.get(loc.id)!
      s.count++
      if (review.rating !== null) s.ratings.push(review.rating)
    }

    const locationSummaries = Array.from(locStats.values()).map((s) => ({
      name: s.name,
      reviewCount: s.count,
      avgRating: s.ratings.length > 0 ? s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length : null,
    }))

    // Negative reviews without replies (needs attention)
    const needsAttention = reviews
      .filter((r: any) => r.sentiment === 'negative' && !r.reply_body)
      .slice(0, 5)
      .map((r: any) => ({
        locationName: (locationMap.get(r.location_id) as any)?.name || 'Unknown',
        reviewerName: r.reviewer_name,
        rating: r.rating,
        body: r.body,
        publishedAt: new Date(r.published_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
      }))

    // Count AI drafts ready for review and replies sent in last 24h
    const { count: aiDraftsReady } = await supabase
      .from('reviews')
      .select('id', { count: 'exact', head: true })
      .in('location_id', orgLocationIds)
      .not('ai_draft', 'is', null)
      .is('reply_body', null)
      .neq('status', 'archived')

    const { count: repliesSent } = await supabase
      .from('reviews')
      .select('id', { count: 'exact', head: true })
      .in('location_id', orgLocationIds)
      .not('reply_body', 'is', null)
      .gte('reply_update_time', since)

    sendEmail({
      to: Array.from(allEmails),
      subject: `${orgName}: ${totalReviews} review${totalReviews === 1 ? '' : 's'} yesterday`,
      html: buildReviewDigestEmail({
        orgName,
        date: dateLabel,
        totalReviews,
        avgRating,
        positiveCount,
        neutralCount,
        negativeCount,
        locations: locationSummaries,
        needsAttention,
        aiDraftsReady: aiDraftsReady || 0,
        repliesSent: repliesSent || 0,
      }),
    }).catch((err) => {
      console.error(`[cron/review-digest] Email failed for org ${orgId}:`, err)
    })

    sentCount++
  }

  return NextResponse.json({
    ok: true,
    orgs_processed: orgMap.size,
    digests_sent: sentCount,
  })
}
