import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { checkAgencyAdmin } from '@/lib/locations'
import { createPost, deletePost } from '@/lib/google/profiles'
import { getValidAccessToken, GoogleAuthError } from '@/lib/google/auth'
import type { GBPLocalPost } from '@/lib/google/profiles'

/**
 * GET /api/locations/[locationId]/gbp-posts
 *
 * List posts for a location (synced + queued).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminClient = createAdminClient()

  const { data: posts } = await adminClient
    .from('gbp_posts')
    .select('*')
    .eq('location_id', params.locationId)
    .order('create_time', { ascending: false })

  const { data: queued } = await adminClient
    .from('gbp_post_queue')
    .select('*')
    .eq('location_id', params.locationId)
    .in('status', ['pending', 'sending'])
    .order('created_at', { ascending: false })

  return NextResponse.json({
    posts: posts || [],
    queued: queued || [],
  })
}

/**
 * POST /api/locations/[locationId]/gbp-posts
 *
 * Create or schedule a post. Agency admin only.
 *
 * Body: {
 *   topic_type: 'STANDARD' | 'EVENT' | 'OFFER' | 'ALERT'
 *   summary: string
 *   action_type?: string
 *   action_url?: string
 *   media_url?: string
 *   event_title?: string
 *   event_start?: string (ISO)
 *   event_end?: string (ISO)
 *   offer_coupon_code?: string
 *   offer_terms?: string
 *   scheduled_for?: string (ISO) — if in the future, queue instead of posting immediately
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  const body = await request.json()
  const { topic_type, summary, action_type, action_url, media_url,
    event_title, event_start, event_end, offer_coupon_code, offer_terms,
    scheduled_for } = body

  if (!summary?.trim()) {
    return NextResponse.json({ error: 'summary required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // If scheduled for the future, queue it
  if (scheduled_for && new Date(scheduled_for) > new Date()) {
    const { data: entry, error: insertError } = await adminClient
      .from('gbp_post_queue')
      .insert({
        location_id: params.locationId,
        topic_type: topic_type || 'STANDARD',
        summary,
        action_type: action_type || null,
        action_url: action_url || null,
        media_url: media_url || null,
        event_title: event_title || null,
        event_start: event_start || null,
        event_end: event_end || null,
        offer_coupon_code: offer_coupon_code || null,
        offer_terms: offer_terms || null,
        scheduled_for,
        queued_by: user!.id,
        status: 'pending',
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, scheduled: true, entry })
  }

  // Post immediately
  try {
    await getValidAccessToken()
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      return NextResponse.json({ error: 'Google connection required' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Google auth error' }, { status: 500 })
  }

  const { data: profile } = await adminClient
    .from('gbp_profiles')
    .select('gbp_location_name, gbp_account_name')
    .eq('location_id', params.locationId)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'No GBP profile found' }, { status: 404 })
  }

  const accountLocationName = profile.gbp_account_name
    ? `${profile.gbp_account_name}/${profile.gbp_location_name}`
    : profile.gbp_location_name

  // Build the post object
  const postPayload: GBPLocalPost = {
    topicType: topic_type || 'STANDARD',
    summary,
    languageCode: 'en',
  }

  if (action_type && action_url) {
    postPayload.callToAction = { actionType: action_type, url: action_url }
  }

  if (media_url) {
    postPayload.media = [{ mediaFormat: 'PHOTO', sourceUrl: media_url }]
  }

  if (topic_type === 'EVENT' && event_title) {
    const start = event_start ? new Date(event_start) : new Date()
    const end = event_end ? new Date(event_end) : new Date(start.getTime() + 24 * 60 * 60 * 1000)
    postPayload.event = {
      title: event_title,
      schedule: {
        startDate: { year: start.getFullYear(), month: start.getMonth() + 1, day: start.getDate() },
        startTime: { hours: start.getHours(), minutes: start.getMinutes() },
        endDate: { year: end.getFullYear(), month: end.getMonth() + 1, day: end.getDate() },
        endTime: { hours: end.getHours(), minutes: end.getMinutes() },
      },
    }
  }

  if (topic_type === 'OFFER') {
    postPayload.offer = {}
    if (offer_coupon_code) postPayload.offer.couponCode = offer_coupon_code
    if (offer_terms) postPayload.offer.termsConditions = offer_terms
  }

  try {
    const created = await createPost(accountLocationName, postPayload)

    // Insert into gbp_posts
    await adminClient
      .from('gbp_posts')
      .insert({
        location_id: params.locationId,
        gbp_post_name: created.name || '',
        topic_type: created.topicType || topic_type || 'STANDARD',
        summary: created.summary || summary,
        action_type: created.callToAction?.actionType || action_type || null,
        action_url: created.callToAction?.url || action_url || null,
        media_url: media_url || null,
        event_title: event_title || null,
        event_start: event_start || null,
        event_end: event_end || null,
        offer_coupon_code: offer_coupon_code || null,
        offer_terms: offer_terms || null,
        state: created.state || 'LIVE',
        search_url: created.searchUrl || null,
        create_time: created.createTime || new Date().toISOString(),
        update_time: created.updateTime || null,
      })

    return NextResponse.json({ ok: true, post: created })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[gbp-posts] Create failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/locations/[locationId]/gbp-posts
 *
 * Delete a post. Agency admin only.
 * Body: { post_id: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  try {
    await getValidAccessToken()
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      return NextResponse.json({ error: 'Google connection required' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Google auth error' }, { status: 500 })
  }

  const body = await request.json()
  const { post_id } = body

  if (!post_id) {
    return NextResponse.json({ error: 'post_id required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  const { data: post } = await adminClient
    .from('gbp_posts')
    .select('gbp_post_name')
    .eq('id', post_id)
    .eq('location_id', params.locationId)
    .single()

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  try {
    await deletePost(post.gbp_post_name)

    await adminClient
      .from('gbp_posts')
      .delete()
      .eq('id', post_id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[gbp-posts] Delete failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
