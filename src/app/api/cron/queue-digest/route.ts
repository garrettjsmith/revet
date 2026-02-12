import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, buildQueueDigestEmail } from '@/lib/email'

export const maxDuration = 60

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.revet.app'

/**
 * GET /api/cron/queue-digest
 *
 * Daily cron that sends a work queue summary email to agency admins
 * when there are pending items.
 *
 * Schedule: Daily at 13:00 UTC (8am ET / 5am PT)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const apiKey = process.env.REVIEW_SYNC_API_KEY

  if (apiKey && authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Count queue items (same queries as work-queue API)
  const [negativeResult, aiDraftResult, googleResult, postResult, reviewSyncResult, profileSyncResult] = await Promise.all([
    supabase
      .from('reviews')
      .select('id', { count: 'exact', head: true })
      .eq('platform', 'google')
      .eq('status', 'new')
      .eq('sentiment', 'negative')
      .is('reply_body', null),
    supabase
      .from('reviews')
      .select('id', { count: 'exact', head: true })
      .not('ai_draft', 'is', null)
      .is('reply_body', null)
      .neq('status', 'archived'),
    supabase
      .from('gbp_profiles')
      .select('location_id', { count: 'exact', head: true })
      .eq('has_google_updated', true),
    supabase
      .from('gbp_post_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('review_sources')
      .select('id', { count: 'exact', head: true })
      .eq('sync_status', 'error'),
    supabase
      .from('gbp_profiles')
      .select('location_id', { count: 'exact', head: true })
      .eq('sync_status', 'error'),
  ])

  const reviewCount = negativeResult.count || 0
  const draftCount = aiDraftResult.count || 0
  const googleUpdateCount = googleResult.count || 0
  const postCount = postResult.count || 0
  const syncErrorCount = (reviewSyncResult.count || 0) + (profileSyncResult.count || 0)
  const totalItems = reviewCount + draftCount + googleUpdateCount + postCount + syncErrorCount

  // Don't send if queue is empty
  if (totalItems === 0) {
    return NextResponse.json({ ok: true, message: 'Queue empty, no digest sent', sent: 0 })
  }

  // Get all agency admin emails
  const { data: agencyAdmins } = await supabase
    .from('org_members')
    .select('user_id')
    .eq('is_agency_admin', true)

  if (!agencyAdmins || agencyAdmins.length === 0) {
    return NextResponse.json({ ok: true, message: 'No agency admins', sent: 0 })
  }

  const userIds = Array.from(new Set(agencyAdmins.map((a) => a.user_id)))
  const recipients: { email: string; name: string | null }[] = []

  for (const uid of userIds) {
    const { data } = await supabase.auth.admin.getUserById(uid)
    if (data?.user?.email) {
      recipients.push({
        email: data.user.email,
        name: data.user.email.split('@')[0],
      })
    }
  }

  if (recipients.length === 0) {
    return NextResponse.json({ ok: true, message: 'No recipient emails', sent: 0 })
  }

  // Send digest to each admin
  let sent = 0
  for (const recipient of recipients) {
    const html = buildQueueDigestEmail({
      recipientName: recipient.name,
      totalItems,
      reviewCount,
      draftCount,
      googleUpdateCount,
      postCount,
      syncErrorCount,
      queueUrl: `${APP_URL}/agency/queue`,
    })

    sendEmail({
      to: recipient.email,
      subject: `Work queue: ${totalItems} item${totalItems === 1 ? '' : 's'} need attention`,
      html,
    }).catch((err) => {
      console.error(`[queue-digest] Email failed for ${recipient.email}:`, err)
    })

    sent++
  }

  return NextResponse.json({
    ok: true,
    total_items: totalItems,
    recipients: sent,
  })
}
