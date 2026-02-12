import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, buildReviewAlertEmail, buildReviewResponseEmail } from '@/lib/email'
import { generateReviewReply } from '@/lib/ai/generate-reply'
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
    const apiKey = process.env.REVIEW_SYNC_API_KEY

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

    // Pre-fetch existing reviews to detect new replies
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

    // Process alert rules
    await processAlertRules(
      supabase,
      (source.locations as any).org_id,
      source.location_id,
      (source.locations as any).name,
      source.platform,
      incomingReviews
    )

    // Detect reviews that newly received replies
    const reviewsWithNewReplies = incomingReviews.filter((review: any) => {
      if (!review.reply_body) return false
      // Only alert if the review existed before without a reply
      if (!existingReplyMap.has(review.platform_review_id)) return false
      return !existingReplyMap.get(review.platform_review_id)
    })

    if (reviewsWithNewReplies.length > 0) {
      await processResponseAlerts(
        supabase,
        (source.locations as any).org_id,
        source.location_id,
        (source.locations as any).name,
        source.platform,
        reviewsWithNewReplies
      )
    }

    // Process autopilot for truly new reviews (not previously in DB)
    const newReviews = incomingReviews.filter((r: any) =>
      !existingReplyMap.has(r.platform_review_id) && !r.reply_body
    )
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
  } catch {
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

  if (!rules || rules.length === 0) return

  // Pre-fetch subscription-based emails for this location
  const subEmailCache = new Map<string, string[]>()
  for (const alertType of ['new_review', 'negative_review']) {
    const { data: emails } = await supabase.rpc('get_subscription_emails', {
      p_org_id: orgId,
      p_location_id: locationId,
      p_alert_type: alertType,
    })
    subEmailCache.set(alertType, (emails || []).map((r: { email: string }) => r.email))
  }

  for (const rule of rules) {
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
        const publishedAt = new Date(review.published_at).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })

        sendEmail({
          to: allEmails,
          subject: rule.rule_type === 'negative_review'
            ? `Negative review: ${locationName}`
            : `New review: ${locationName}`,
          html: buildReviewAlertEmail({
            locationName,
            platform,
            reviewerName: review.reviewer_name,
            rating: review.rating,
            body: review.body,
            publishedAt,
            alertType: rule.rule_type,
          }),
        }).catch((err) => {
          console.error('[reviews/sync] Alert email failed:', err)
        })
      }
    }
  }
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

async function processAutopilot(
  supabase: ReturnType<typeof createAdminClient>,
  sourceId: string,
  locationId: string,
  locationName: string,
  reviews: any[]
) {
  if (!process.env.ANTHROPIC_API_KEY) return

  // Check if autopilot is enabled for this location
  const { data: config } = await supabase
    .from('review_autopilot_config')
    .select('*')
    .eq('location_id', locationId)
    .eq('enabled', true)
    .single()

  if (!config) return

  const autoRatings: number[] = (config as any).auto_reply_ratings || [4, 5]

  // Limit to 10 reviews per sync run to stay within timeout
  const eligible = reviews
    .filter((r: any) => r.rating !== null && autoRatings.includes(r.rating))
    .slice(0, 10)

  if (eligible.length === 0) return

  for (const review of eligible) {
    // Look up the DB review record
    const { data: dbReview } = await supabase
      .from('reviews')
      .select('id, ai_draft')
      .eq('source_id', sourceId)
      .eq('platform_review_id', review.platform_review_id)
      .single()

    if (!dbReview || dbReview.ai_draft) continue

    // Check no existing queue entry
    const { data: existingQueue } = await supabase
      .from('review_reply_queue')
      .select('id')
      .eq('review_id', dbReview.id)
      .limit(1)

    if (existingQueue && existingQueue.length > 0) continue

    try {
      const draft = await generateReviewReply({
        businessName: locationName,
        businessContext: (config as any).business_context,
        reviewerName: review.reviewer_name,
        rating: review.rating,
        reviewBody: review.body,
        tone: (config as any).tone,
      })

      // Save draft on the review
      await supabase
        .from('reviews')
        .update({
          ai_draft: draft,
          ai_draft_generated_at: new Date().toISOString(),
        })
        .eq('id', dbReview.id)

      // If not requiring approval, queue for auto-posting with random delay
      if (!(config as any).require_approval) {
        const minDelay = ((config as any).delay_min_minutes || 30) * 60 * 1000
        const maxDelay = ((config as any).delay_max_minutes || 180) * 60 * 1000
        const delay = minDelay + Math.random() * (maxDelay - minDelay)
        const scheduledFor = new Date(Date.now() + delay).toISOString()

        await supabase.from('review_reply_queue').insert({
          review_id: dbReview.id,
          reply_body: draft,
          queued_by: '00000000-0000-0000-0000-000000000000',
          status: 'pending',
          source: 'ai_autopilot',
          scheduled_for: scheduledFor,
        })
      }
    } catch (err) {
      console.error(`[reviews/sync] Autopilot generation failed for review ${dbReview.id}:`, err)
    }
  }
}
