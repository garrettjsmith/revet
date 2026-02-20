import { createAdminClient } from '@/lib/supabase/admin'
import { generateReviewReply } from '@/lib/ai/generate-reply'

/**
 * Generate AI reply drafts for reviews via the autopilot system.
 *
 * Used by:
 * - /api/reviews/sync — drafts for newly synced reviews
 * - /api/google/reviews/backfill — drafts for all unreplied reviews after import
 */
export async function processAutopilot(
  supabase: ReturnType<typeof createAdminClient>,
  sourceId: string,
  locationId: string,
  locationName: string,
  reviews: any[],
  options?: { limit?: number }
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
  const limit = options?.limit ?? 10

  const eligible = reviews
    .filter((r: any) => r.rating !== null && autoRatings.includes(r.rating))
    .slice(0, limit)

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
      console.error(`[autopilot] Generation failed for review ${dbReview.id}:`, err)
    }
  }
}
