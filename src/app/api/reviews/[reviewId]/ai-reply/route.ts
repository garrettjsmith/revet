import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateReviewReply } from '@/lib/ai/generate-reply'

/**
 * POST /api/reviews/[reviewId]/ai-reply
 *
 * Generates an AI draft reply for a review. Saves the draft on the review
 * record and returns it so the UI can pre-fill the reply textarea.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { reviewId: string } }
) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  }

  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminClient = createAdminClient()

  // Get the review
  const { data: review } = await adminClient
    .from('reviews')
    .select('id, location_id, platform, reviewer_name, rating, body')
    .eq('id', params.reviewId)
    .single()

  if (!review) {
    return NextResponse.json({ error: 'Review not found' }, { status: 404 })
  }

  // Verify user has access to this location
  const { data: access } = await supabase
    .from('locations')
    .select('id, name')
    .eq('id', review.location_id)
    .single()

  if (!access) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Check for autopilot config (for tone/context)
  const { data: config } = await adminClient
    .from('review_autopilot_config')
    .select('tone, business_context')
    .eq('location_id', review.location_id)
    .single()

  try {
    const draft = await generateReviewReply({
      businessName: access.name,
      businessContext: config?.business_context,
      reviewerName: review.reviewer_name,
      rating: review.rating,
      reviewBody: review.body,
      tone: config?.tone,
    })

    // Save draft on the review
    await adminClient
      .from('reviews')
      .update({
        ai_draft: draft,
        ai_draft_generated_at: new Date().toISOString(),
      })
      .eq('id', params.reviewId)

    return NextResponse.json({ ok: true, draft })
  } catch (err) {
    console.error('[ai-reply] Generation failed:', err)
    return NextResponse.json({ error: 'Failed to generate reply' }, { status: 500 })
  }
}
