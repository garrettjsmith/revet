import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateReviewReply } from '@/lib/ai/generate-reply'
import { tiersWithFeature } from '@/lib/tiers'

export const maxDuration = 60

const MAX_REVIEWS_PER_RUN = 50

/**
 * GET /api/cron/ai-drafts
 *
 * Pre-generates AI reply drafts for unreplied Google reviews.
 * Only processes reviews for locations with autopilot enabled
 * whose ratings match the configured auto_reply_ratings.
 *
 * Runs every 30 minutes via Vercel cron.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const apiKey = process.env.REVIEW_SYNC_API_KEY

  if (apiKey && authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  }

  const supabase = createAdminClient()

  // Get all locations with autopilot enabled
  const { data: configs } = await supabase
    .from('review_autopilot_config')
    .select('location_id, auto_reply_ratings, tone, business_context, require_approval, delay_min_minutes, delay_max_minutes')
    .eq('enabled', true)

  if (!configs || configs.length === 0) {
    return NextResponse.json({ ok: true, generated: 0, message: 'No autopilot configs enabled' })
  }

  const locationIds = configs.map((c) => c.location_id)

  // Get location names for AI context — filter to tiers that include AI drafts
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name, service_tier')
    .in('id', locationIds)
    .in('service_tier', tiersWithFeature('ai_reply_drafts'))

  const locationMap = new Map(locations?.map((l) => [l.id, l]) || [])
  const configMap = new Map(configs.map((c) => [c.location_id, c]))

  // Only process locations that passed the tier filter
  const eligibleLocationIds = locations?.map((l) => l.id) || []
  if (eligibleLocationIds.length === 0) {
    return NextResponse.json({ ok: true, generated: 0, message: 'No eligible locations (tier filter)' })
  }

  // Find Google reviews needing AI drafts:
  // - status = 'new' (not yet handled)
  // - platform = 'google' (only Google reviews can get API replies)
  // - reply_body IS NULL (not already replied)
  // - ai_draft IS NULL (draft not yet generated)
  // - published in last 7 days (don't draft for old reviews)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: reviews } = await supabase
    .from('reviews')
    .select('id, location_id, reviewer_name, rating, body')
    .in('location_id', eligibleLocationIds)
    .eq('status', 'new')
    .eq('platform', 'google')
    .is('reply_body', null)
    .is('ai_draft', null)
    .gte('published_at', sevenDaysAgo)
    .order('published_at', { ascending: true })
    .limit(MAX_REVIEWS_PER_RUN)

  if (!reviews || reviews.length === 0) {
    return NextResponse.json({ ok: true, generated: 0, message: 'No reviews need drafts' })
  }

  let generated = 0
  let queued = 0
  let skipped = 0

  for (const review of reviews) {
    const config = configMap.get(review.location_id)
    if (!config) continue

    // Skip if rating doesn't match autopilot config
    const ratings = config.auto_reply_ratings as number[]
    if (review.rating !== null && !ratings.includes(review.rating)) {
      skipped++
      continue
    }

    const loc = locationMap.get(review.location_id)
    const businessName = loc?.name || 'the business'

    try {
      const draft = await generateReviewReply({
        businessName,
        businessContext: config.business_context,
        reviewerName: review.reviewer_name,
        rating: review.rating,
        reviewBody: review.body,
        tone: config.tone,
      })

      // Save draft on the review
      await supabase
        .from('reviews')
        .update({
          ai_draft: draft,
          ai_draft_generated_at: new Date().toISOString(),
        })
        .eq('id', review.id)

      generated++

      // If require_approval is false AND tier is premium, queue for auto-send with delay
      const isPremium = loc?.service_tier === 'premium'
      if (!config.require_approval && isPremium) {
        const delayMin = config.delay_min_minutes || 30
        const delayMax = config.delay_max_minutes || 180
        const delayMs = (delayMin + Math.random() * (delayMax - delayMin)) * 60 * 1000
        const scheduledFor = new Date(Date.now() + delayMs).toISOString()

        await supabase
          .from('review_reply_queue')
          .insert({
            review_id: review.id,
            reply_body: draft,
            queued_by: '00000000-0000-0000-0000-000000000000', // system
            source: 'ai_autopilot',
            scheduled_for: scheduledFor,
            status: 'pending',
          })

        queued++
      }
    } catch (err) {
      console.error(`[ai-drafts] Failed to generate draft for review ${review.id}:`, err)
    }
  }

  return NextResponse.json({
    ok: true,
    processed: reviews.length,
    generated,
    queued,
    skipped,
  })
}
