import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPost } from '@/lib/google/profiles'
import { getValidAccessToken, GoogleAuthError } from '@/lib/google/auth'
import type { GBPLocalPost } from '@/lib/google/profiles'

export const maxDuration = 60

const MAX_ATTEMPTS = 5

/**
 * GET /api/cron/post-queue
 *
 * Processes pending GBP post queue entries. Picks up entries
 * whose scheduled_for time has passed (or is null) and attempts
 * to post them to Google via the GBP API.
 *
 * Runs every 5 minutes via Vercel cron.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const apiKey = process.env.REVIEW_SYNC_API_KEY

  if (apiKey && authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  // Fetch pending entries ready to post
  const { data: entries } = await supabase
    .from('gbp_post_queue')
    .select('*')
    .eq('status', 'pending')
    .or('scheduled_for.is.null,scheduled_for.lte.' + new Date().toISOString())
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(20)

  if (!entries || entries.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  // Batch-lookup GBP profiles for all locations in this batch
  const locationIds = Array.from(new Set(entries.map((e: any) => e.location_id)))
  const { data: profiles } = await supabase
    .from('gbp_profiles')
    .select('location_id, gbp_location_name, gbp_account_name')
    .in('location_id', locationIds)

  const profileMap = new Map(
    (profiles || []).map((p: any) => [p.location_id, p])
  )

  let confirmed = 0
  let failed = 0

  for (const entry of entries) {
    const profile = profileMap.get(entry.location_id)
    if (!profile?.gbp_location_name) {
      await supabase
        .from('gbp_post_queue')
        .update({ status: 'failed', last_error: 'No GBP profile found for location' })
        .eq('id', entry.id)
      failed++
      continue
    }

    // Mark as sending
    await supabase
      .from('gbp_post_queue')
      .update({ status: 'sending', attempts: entry.attempts + 1 })
      .eq('id', entry.id)

    const accountLocationName = profile.gbp_account_name
      ? `${profile.gbp_account_name}/${profile.gbp_location_name}`
      : profile.gbp_location_name

    // Build post payload
    const postPayload: GBPLocalPost = {
      topicType: entry.topic_type || 'STANDARD',
      summary: entry.summary,
      languageCode: 'en',
    }

    if (entry.action_type && entry.action_url) {
      postPayload.callToAction = { actionType: entry.action_type, url: entry.action_url }
    }

    if (entry.media_url) {
      postPayload.media = [{ mediaFormat: 'PHOTO', sourceUrl: entry.media_url }]
    }

    if (entry.topic_type === 'EVENT' && entry.event_title) {
      const start = entry.event_start ? new Date(entry.event_start) : new Date()
      const end = entry.event_end ? new Date(entry.event_end) : new Date(start.getTime() + 24 * 60 * 60 * 1000)
      postPayload.event = {
        title: entry.event_title,
        schedule: {
          startDate: { year: start.getFullYear(), month: start.getMonth() + 1, day: start.getDate() },
          startTime: { hours: start.getHours(), minutes: start.getMinutes() },
          endDate: { year: end.getFullYear(), month: end.getMonth() + 1, day: end.getDate() },
          endTime: { hours: end.getHours(), minutes: end.getMinutes() },
        },
      }
    }

    if (entry.topic_type === 'OFFER') {
      postPayload.offer = {}
      if (entry.offer_coupon_code) postPayload.offer.couponCode = entry.offer_coupon_code
      if (entry.offer_terms) postPayload.offer.termsConditions = entry.offer_terms
    }

    try {
      const created = await createPost(accountLocationName, postPayload)

      // Success — update queue + insert into gbp_posts
      await supabase
        .from('gbp_post_queue')
        .update({
          status: 'confirmed',
          sent_at: new Date().toISOString(),
          gbp_post_name: created.name || null,
        })
        .eq('id', entry.id)

      await supabase
        .from('gbp_posts')
        .insert({
          location_id: entry.location_id,
          gbp_post_name: created.name || '',
          topic_type: created.topicType || entry.topic_type || 'STANDARD',
          summary: created.summary || entry.summary,
          action_type: created.callToAction?.actionType || entry.action_type || null,
          action_url: created.callToAction?.url || entry.action_url || null,
          media_url: entry.media_url || null,
          event_title: entry.event_title || null,
          event_start: entry.event_start || null,
          event_end: entry.event_end || null,
          offer_coupon_code: entry.offer_coupon_code || null,
          offer_terms: entry.offer_terms || null,
          state: created.state || 'LIVE',
          search_url: created.searchUrl || null,
          create_time: created.createTime || new Date().toISOString(),
          update_time: created.updateTime || null,
        })

      confirmed++
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      const newAttempts = entry.attempts + 1
      const newStatus = newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending'

      await supabase
        .from('gbp_post_queue')
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
