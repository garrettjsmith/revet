import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, buildReviewAlertEmail } from '@/lib/email'
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

      if (rule.notify_emails && rule.notify_emails.length > 0) {
        const publishedAt = new Date(review.published_at).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })

        sendEmail({
          to: rule.notify_emails,
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
