import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, buildReviewAlertEmail, buildReviewResponseEmail } from '@/lib/email'
import { processAutopilot } from '@/lib/autopilot'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/reviews/sync
 *
 * Ingests reviews from external sources. Designed to be called by:
 * 1. Google Pub/Sub webhook for real-time new review notifications
 * 2. A cron job for periodic full sync
 * 3. Manual trigger from admin UI
 *
 * Body: {
 *   source_id: string       — which review source to sync
 *   reviews: Review[]       — array of reviews to upsert
 *   trigger?: string        — 'pubsub' | 'cron' | 'manual'
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const apiKey = process.env.CRON_SECRET

    if (apiKey && authHeader !== `Bearer ${apiKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { source_id, reviews: incomingReviews, trigger = 'manual' } = body

    if (!source_id) {
      return NextResponse.json({ error: 'source_id required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: source, error: sourceError } = await supabase
      .from('review_sources')
      .select('*, locations(id, name, org_id)')
      .eq('id', source_id)
      .single()

    if (sourceError || !source) {
      return NextResponse.json({ error: 'Review source not found' }, { status: 404 })
    }

    if (!incomingReviews || !Array.isArray(incomingReviews) || incomingReviews.length === 0) {
      return NextResponse.json({ error: 'No reviews to sync' }, { status: 400 })
    }

    // Pre-fetch existing reviews to detect new reviews and new replies
    const platformReviewIds = incomingReviews
      .map((r: any) => r.platform_review_id)
      .filter(Boolean)

    const { data: existingReviews } = await supabase
      .from('reviews')
      .select('platform_review_id, reply_body')
      .eq('source_id', source_id)
      .in('platform_review_id', platformReviewIds)

    const existingReplyMap = new Map(
      (existingReviews || []).map((r: any) => [r.platform_review_id, r.reply_body])
    )

    let processedCount = 0

    for (const review of incomingReviews) {
      const sentiment = classifyRating(review.rating)

      const { error: upsertError } = await supabase
        .from('reviews')
        .upsert(
          {
            source_id,
            location_id: source.location_id,
            platform: source.platform,
            platform_review_id: review.platform_review_id,
            reviewer_name: review.reviewer_name || null,
            reviewer_photo_url: review.reviewer_photo_url || null,
            is_anonymous: review.is_anonymous || false,
            rating: review.rating ?? null,
            original_rating: review.original_rating || null,
            body: review.body || null,
            language: review.language || 'en',
            published_at: review.published_at,
            updated_at: review.updated_at || null,
            reply_body: review.reply_body || null,
            reply_published_at: review.reply_published_at || null,
            sentiment,
            platform_metadata: review.platform_metadata || {},
            fetched_at: new Date().toISOString(),
          },
          { onConflict: 'source_id,platform_review_id' }
        )

      if (!upsertError) processedCount++
    }

    // Update source stats
    await supabase
      .from('review_sources')
      .update({
        last_synced_at: new Date().toISOString(),
        sync_status: 'active',
      })
      .eq('id', source_id)

    // Filter to truly new reviews (not previously in DB) — prevents flooding
    // on initial sync or when cron/pubsub re-fetches known reviews
    const newReviews = incomingReviews.filter((r: any) =>
      !existingReplyMap.has(r.platform_review_id) && !r.reply_body
    )

    // Determine which new reviews should trigger email notifications.
    // On initial sync (source never synced before), ALL reviews are "new" to the DB
    // but most are old reviews (potentially years old). Suppress notifications for
    // these to avoid flooding users with alerts for pre-existing reviews.
    const isInitialSync = !source.last_synced_at
    const NOTIFICATION_RECENCY_DAYS = 7
    const notificationCutoff = new Date()
    notificationCutoff.setDate(notificationCutoff.getDate() - NOTIFICATION_RECENCY_DAYS)

    const notifiableReviews = isInitialSync
      ? [] // Never notify on first sync — all reviews are historical
      : newReviews.filter((r: any) => {
          // Safety net: even on subsequent syncs, only notify for recent reviews.
          // Prevents alerts if a sync gap causes old reviews to appear as "new".
          if (!r.published_at) return false
          return new Date(r.published_at) >= notificationCutoff
        })

    // Process alert rules — only for notifiable reviews, non-blocking
    if (notifiableReviews.length > 0) {
      try {
        await processAlertRules(
          supabase,
          (source.locations as any).org_id,
          source.location_id,
          (source.locations as any).name,
          source.platform,
          notifiableReviews
        )
      } catch (alertErr) {
        console.error('[reviews/sync] Alert processing failed (reviews still synced):', alertErr)
      }
    }

    // Detect reviews that newly received replies
    const reviewsWithNewReplies = incomingReviews.filter((review: any) => {
      if (!review.reply_body) return false
      // Only alert if the review existed before without a reply
      if (!existingReplyMap.has(review.platform_review_id)) return false
      return !existingReplyMap.get(review.platform_review_id)
    })

    if (!isInitialSync && reviewsWithNewReplies.length > 0) {
      await processResponseAlerts(
        supabase,
        (source.locations as any).org_id,
        source.location_id,
        (source.locations as any).name,
        source.platform,
        reviewsWithNewReplies
      )
    }

    // Process autopilot for all truly new reviews — AI drafts should be
    // generated regardless of review age so the agency can respond to everything.
    // (Notifications are gated separately by recency above.)
    if (newReviews.length > 0) {
      await processAutopilot(
        supabase,
        source_id,
        source.location_id,
        (source.locations as any).name,
        newReviews
      )
    }

    return NextResponse.json({
      ok: true,
      trigger,
      source_id,
      processed: processedCount,
    })
  } catch (err) {
    console.error('[reviews/sync] Sync failed:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

function classifyRating(rating: number | null): 'positive' | 'neutral' | 'negative' | null {
  if (rating === null || rating === undefined) return null
  if (rating >= 4) return 'positive'
  if (rating === 3) return 'neutral'
  return 'negative'
}

async function processAlertRules(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  locationId: string,
  locationName: string,
  platform: string,
  reviews: any[]
) {
  const { data: rules } = await supabase
    .from('review_alert_rules')
    .select('*')
    .eq('org_id', orgId)
    .eq('active', true)
    .or(`location_id.is.null,location_id.eq.${locationId}`)

  // Pre-fetch subscription-based emails for this location
  // Always check subscriptions, even if no explicit rules exist
  const subEmailCache = new Map<string, string[]>()
  for (const alertType of ['new_review', 'negative_review']) {
    const { data: emails } = await supabase.rpc('get_subscription_emails', {
      p_org_id: orgId,
      p_location_id: locationId,
      p_alert_type: alertType,
    })
    subEmailCache.set(alertType, (emails || []).map((r: { email: string }) => r.email))
  }

  // Process explicit alert rules
  for (const rule of rules || []) {
    for (const review of reviews) {
      let shouldAlert = false

      switch (rule.rule_type) {
        case 'new_review':
          shouldAlert = true
          break
        case 'negative_review': {
          const threshold = (rule.config as any)?.threshold ?? 3
          shouldAlert = review.rating !== null && review.rating <= threshold
          break
        }
        case 'keyword_match': {
          const keywords = (rule.config as any)?.keywords || []
          const text = (review.body || '').toLowerCase()
          shouldAlert = keywords.some((kw: string) => text.includes(kw.toLowerCase()))
          break
        }
      }

      if (!shouldAlert) continue

      // Combine rule emails + subscription-based emails
      const ruleEmails = rule.notify_emails || []
      const subAlertType = rule.rule_type === 'keyword_match' ? 'new_review' : rule.rule_type
      const subEmails = subEmailCache.get(subAlertType) || []
      const allEmails = Array.from(new Set([...ruleEmails, ...subEmails]))

      if (allEmails.length > 0) {
        sendAlertEmail(allEmails, rule.rule_type, locationName, platform, review)
      }
    }
  }

  // If no explicit 'new_review' rule exists, still notify subscription-based recipients
  const hasNewReviewRule = (rules || []).some((r: any) => r.rule_type === 'new_review')
  if (!hasNewReviewRule) {
    const subEmails = subEmailCache.get('new_review') || []
    if (subEmails.length > 0) {
      for (const review of reviews) {
        sendAlertEmail(subEmails, 'new_review', locationName, platform, review)
      }
    }
  }

  // If no explicit 'negative_review' rule exists, still notify subscription-based recipients
  const hasNegativeRule = (rules || []).some((r: any) => r.rule_type === 'negative_review')
  if (!hasNegativeRule) {
    const subEmails = subEmailCache.get('negative_review') || []
    if (subEmails.length > 0) {
      for (const review of reviews) {
        if (review.rating !== null && review.rating <= 3) {
          sendAlertEmail(subEmails, 'negative_review', locationName, platform, review)
        }
      }
    }
  }
}

function sendAlertEmail(
  emails: string[],
  ruleType: string,
  locationName: string,
  platform: string,
  review: any
) {
  const publishedAt = new Date(review.published_at).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  sendEmail({
    to: emails,
    subject: ruleType === 'negative_review'
      ? `Negative review: ${locationName}`
      : `New review: ${locationName}`,
    html: buildReviewAlertEmail({
      locationName,
      platform,
      reviewerName: review.reviewer_name,
      rating: review.rating,
      body: review.body,
      publishedAt,
      alertType: ruleType,
    }),
  }).catch((err) => {
    console.error('[reviews/sync] Alert email failed:', err)
  })
}

async function processResponseAlerts(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  locationId: string,
  locationName: string,
  platform: string,
  reviews: any[]
) {
  const { data: emails } = await supabase.rpc('get_subscription_emails', {
    p_org_id: orgId,
    p_location_id: locationId,
    p_alert_type: 'review_response',
  })

  const recipients = (emails || []).map((r: { email: string }) => r.email)
  if (recipients.length === 0) return

  for (const review of reviews) {
    const repliedAt = new Date(review.reply_published_at || new Date()).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })

    sendEmail({
      to: recipients,
      subject: `Response posted: ${locationName}`,
      html: buildReviewResponseEmail({
        locationName,
        platform,
        reviewerName: review.reviewer_name,
        rating: review.rating,
        reviewBody: review.body,
        replyBody: review.reply_body,
        repliedAt,
      }),
    }).catch((err) => {
      console.error('[reviews/sync] Response alert email failed:', err)
    })
  }
}

