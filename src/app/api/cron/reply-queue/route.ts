import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { replyToGoogleReview } from '@/lib/google/reviews'
import { getValidAccessToken, GoogleAuthError } from '@/lib/google/auth'

export const maxDuration = 60

const MAX_ATTEMPTS = 5

/**
 * GET /api/cron/reply-queue
 *
 * Processes pending review reply queue entries. Picks up entries
 * whose scheduled_for time has passed (or is null) and attempts
 * to post them to Google via the GBP API.
 *
 * Runs every 5 minutes via Vercel cron.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const apiKey = process.env.CRON_SECRET

  if (apiKey && authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify Google auth is valid before processing
  try {
    await getValidAccessToken()
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      return NextResponse.json(
        { error: 'Google integration requires reconnection' },
        { status: 401 }
      )
    }
    return NextResponse.json({ error: 'Google auth error' }, { status: 500 })
  }

  const supabase = createAdminClient()

  // Fetch pending entries ready to send
  const { data: entries } = await supabase
    .from('review_reply_queue')
    .select('*, reviews(id, platform_metadata, location_id)')
    .eq('status', 'pending')
    .or('scheduled_for.is.null,scheduled_for.lte.' + new Date().toISOString())
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(20)

  if (!entries || entries.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  let confirmed = 0
  let failed = 0

  for (const entry of entries) {
    const review = entry.reviews as any
    if (!review) continue

    const resourceName = review.platform_metadata?.resource_name
    if (!resourceName) {
      // Can't post without a resource name — mark failed
      await supabase
        .from('review_reply_queue')
        .update({ status: 'failed', last_error: 'No Google resource name on review' })
        .eq('id', entry.id)
      failed++
      continue
    }

    // Mark as sending
    await supabase
      .from('review_reply_queue')
      .update({ status: 'sending', attempts: entry.attempts + 1 })
      .eq('id', entry.id)

    try {
      await replyToGoogleReview(resourceName, entry.reply_body)

      // Success — update queue entry and review record
      await supabase
        .from('review_reply_queue')
        .update({ status: 'confirmed', sent_at: new Date().toISOString() })
        .eq('id', entry.id)

      const repliedVia = entry.source === 'ai_autopilot' ? 'ai_autopilot' : 'api'
      await supabase
        .from('reviews')
        .update({
          reply_body: entry.reply_body,
          reply_published_at: new Date().toISOString(),
          replied_via: repliedVia,
          status: 'responded',
        })
        .eq('id', entry.review_id)

      confirmed++
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      const newAttempts = entry.attempts + 1
      const newStatus = newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending'

      await supabase
        .from('review_reply_queue')
        .update({ status: newStatus, last_error: errorMessage })
        .eq('id', entry.id)

      if (newStatus === 'failed') failed++
    }
  }

  return NextResponse.json({
    ok: true,
    processed: entries.length,
    confirmed,
    failed,
  })
}
