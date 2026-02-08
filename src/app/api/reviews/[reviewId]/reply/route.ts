import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { replyToGoogleReview } from '@/lib/google/reviews'

/**
 * POST /api/reviews/[reviewId]/reply
 *
 * Posts a reply to a review. For Google reviews, this calls the GBP API directly.
 * For other platforms, stores the reply for manual posting.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { reviewId: string } }
) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { reply_body } = body

  if (!reply_body || typeof reply_body !== 'string' || reply_body.trim().length === 0) {
    return NextResponse.json({ error: 'Reply body required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Get the review with its source
  const { data: review, error: reviewError } = await adminClient
    .from('reviews')
    .select('*, review_sources(platform, metadata)')
    .eq('id', params.reviewId)
    .single()

  if (reviewError || !review) {
    return NextResponse.json({ error: 'Review not found' }, { status: 404 })
  }

  // Verify the user has access to this location
  const { data: access } = await supabase
    .from('locations')
    .select('id')
    .eq('id', review.location_id)
    .single()

  if (!access) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // For Google reviews, post via API
  if (review.platform === 'google') {
    const resourceName = (review.platform_metadata as any)?.resource_name

    if (!resourceName) {
      return NextResponse.json(
        { error: 'Google review resource name not found' },
        { status: 400 }
      )
    }

    try {
      await replyToGoogleReview(resourceName, reply_body.trim())

      // Update the review record
      await adminClient
        .from('reviews')
        .update({
          reply_body: reply_body.trim(),
          reply_published_at: new Date().toISOString(),
          replied_by: user.id,
          replied_via: 'api',
          status: 'responded',
        })
        .eq('id', params.reviewId)

      return NextResponse.json({ ok: true, posted_via: 'api' })
    } catch (err) {
      console.error('[reviews/reply] Google API error:', err)

      // Queue the reply for retry
      await adminClient.from('review_reply_queue').insert({
        review_id: params.reviewId,
        reply_body: reply_body.trim(),
        queued_by: user.id,
        status: 'pending',
      })

      return NextResponse.json(
        { ok: true, posted_via: 'queued', message: 'Reply queued for retry' },
        { status: 202 }
      )
    }
  }

  // For non-Google platforms, just store the reply (user posts manually on the platform)
  await adminClient
    .from('reviews')
    .update({
      reply_body: reply_body.trim(),
      reply_published_at: new Date().toISOString(),
      replied_by: user.id,
      replied_via: 'manual',
      status: 'responded',
    })
    .eq('id', params.reviewId)

  return NextResponse.json({ ok: true, posted_via: 'manual' })
}
