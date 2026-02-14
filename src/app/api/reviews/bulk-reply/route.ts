import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { replyToGoogleReview } from '@/lib/google/reviews'

export const maxDuration = 30

/**
 * POST /api/reviews/bulk-reply
 *
 * Posts a single reply to multiple reviews at once.
 * Google reviews go via API (queued on failure). Others stored as manual.
 */
export async function POST(request: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { review_ids, reply_body } = body

  if (!reply_body || typeof reply_body !== 'string' || reply_body.trim().length === 0) {
    return NextResponse.json({ error: 'Reply body required' }, { status: 400 })
  }

  if (!Array.isArray(review_ids) || review_ids.length === 0) {
    return NextResponse.json({ error: 'At least one review_id required' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const trimmed = reply_body.trim()

  // Get all reviews
  const { data: reviews, error: reviewsError } = await adminClient
    .from('reviews')
    .select('id, platform, location_id, platform_metadata')
    .in('id', review_ids)

  if (reviewsError || !reviews || reviews.length === 0) {
    return NextResponse.json({ error: 'No reviews found' }, { status: 404 })
  }

  // Verify user has access to all locations
  const locationIds = Array.from(new Set(reviews.map((r: any) => r.location_id)))
  const { data: accessible } = await supabase
    .from('locations')
    .select('id')
    .in('id', locationIds)

  const accessibleIds = new Set((accessible || []).map((l: any) => l.id))
  const denied = reviews.some((r: any) => !accessibleIds.has(r.location_id))
  if (denied) {
    return NextResponse.json({ error: 'Access denied to some reviews' }, { status: 403 })
  }

  const results = { posted: 0, queued: 0, stored: 0, failed: 0 }

  for (const review of reviews as any[]) {
    if (review.platform === 'google') {
      const resourceName = review.platform_metadata?.resource_name
      if (!resourceName) {
        results.failed++
        continue
      }

      try {
        await replyToGoogleReview(resourceName, trimmed)
        await adminClient
          .from('reviews')
          .update({
            reply_body: trimmed,
            reply_published_at: new Date().toISOString(),
            replied_by: user.id,
            replied_via: 'api',
            status: 'responded',
          })
          .eq('id', review.id)
        results.posted++
      } catch {
        await adminClient.from('review_reply_queue').insert({
          review_id: review.id,
          reply_body: trimmed,
          queued_by: user.id,
          status: 'pending',
        })
        results.queued++
      }
    } else {
      await adminClient
        .from('reviews')
        .update({
          reply_body: trimmed,
          reply_published_at: new Date().toISOString(),
          replied_by: user.id,
          replied_via: 'manual',
          status: 'responded',
        })
        .eq('id', review.id)
      results.stored++
    }
  }

  return NextResponse.json({ ok: true, results })
}
