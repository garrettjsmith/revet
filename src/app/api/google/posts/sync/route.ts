import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listPosts } from '@/lib/google/profiles'
import { getValidAccessToken, GoogleAuthError } from '@/lib/google/auth'

export const maxDuration = 120

/**
 * POST /api/google/posts/sync
 *
 * Syncs GBP posts for mapped locations.
 * Fetches from Google and upserts into gbp_posts table.
 *
 * Body (optional): {
 *   location_ids?: string[]
 *   limit?: number  (default 10)
 * }
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const apiKey = process.env.CRON_SECRET

  if (apiKey && authHeader === `Bearer ${apiKey}`) {
    // API key auth
  } else {
    const { createServerSupabase } = await import('@/lib/supabase/server')
    const supabase = createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminClient = createAdminClient()
    const { data: admin } = await adminClient
      .from('org_members')
      .select('is_agency_admin')
      .eq('user_id', user.id)
      .eq('is_agency_admin', true)
      .limit(1)
      .single()

    if (!admin) {
      return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
    }
  }

  try {
    await getValidAccessToken()
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      return NextResponse.json({ error: 'Google connection required' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Google auth error' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const locationIds: string[] | undefined = body.location_ids
  const limit = body.limit || 10

  const supabase = createAdminClient()

  let query = supabase
    .from('agency_integration_mappings')
    .select('external_resource_id, external_resource_name, location_id, metadata')
    .eq('resource_type', 'gbp_location')
    .not('location_id', 'is', null)
    .limit(limit)

  if (locationIds && locationIds.length > 0) {
    query = query.in('location_id', locationIds)
  }

  const { data: mappings } = await query

  if (!mappings || mappings.length === 0) {
    return NextResponse.json({ ok: true, message: 'No locations to sync', synced: 0 })
  }

  const results: Array<{ location_id: string; name: string; ok: boolean; post_count?: number; error?: string }> = []

  for (const mapping of mappings) {
    const locationName = mapping.external_resource_id
    const locationId = mapping.location_id!
    const displayName = mapping.external_resource_name || locationName

    try {
      // Get account name from gbp_profiles for v4 API
      const { data: profile } = await supabase
        .from('gbp_profiles')
        .select('gbp_account_name')
        .eq('location_id', locationId)
        .single()

      const accountLocationName = profile?.gbp_account_name
        ? `${profile.gbp_account_name}/${locationName}`
        : locationName

      // Fetch posts with pagination (max 3 pages)
      const allPosts: Array<Record<string, any>> = []
      let pageToken: string | undefined
      for (let page = 0; page < 3; page++) {
        const result = await listPosts(accountLocationName, { pageToken })
        allPosts.push(...result.posts)
        pageToken = result.nextPageToken
        if (!pageToken) break
      }

      // Upsert posts
      for (const post of allPosts) {
        const eventStart = post.event?.schedule?.startDate
          ? googleDateToISO(post.event.schedule.startDate, post.event.schedule.startTime)
          : null
        const eventEnd = post.event?.schedule?.endDate
          ? googleDateToISO(post.event.schedule.endDate, post.event.schedule.endTime)
          : null

        await supabase
          .from('gbp_posts')
          .upsert(
            {
              location_id: locationId,
              gbp_post_name: post.name,
              topic_type: post.topicType || 'STANDARD',
              summary: post.summary || null,
              action_type: post.callToAction?.actionType || null,
              action_url: post.callToAction?.url || null,
              media_url: post.media?.[0]?.sourceUrl || post.media?.[0]?.googleUrl || null,
              event_title: post.event?.title || null,
              event_start: eventStart,
              event_end: eventEnd,
              offer_coupon_code: post.offer?.couponCode || null,
              offer_terms: post.offer?.termsConditions || null,
              state: post.state || 'LIVE',
              search_url: post.searchUrl || null,
              create_time: post.createTime || null,
              update_time: post.updateTime || null,
            },
            { onConflict: 'location_id,gbp_post_name' }
          )
      }

      results.push({ location_id: locationId, name: displayName, ok: true, post_count: allPosts.length })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[posts/sync] Error for ${locationId}:`, errorMessage)
      results.push({ location_id: locationId, name: displayName, ok: false, error: errorMessage })
    }
  }

  const synced = results.filter((r) => r.ok).length

  return NextResponse.json({
    ok: true,
    locations_processed: results.length,
    posts_synced: synced,
    results,
  })
}

// Vercel cron sends GET
export const GET = POST

/** Convert Google's {year, month, day} + optional {hours, minutes} to ISO string. */
function googleDateToISO(
  date: { year: number; month: number; day: number },
  time?: { hours?: number; minutes?: number }
): string {
  const y = date.year
  const m = String(date.month).padStart(2, '0')
  const d = String(date.day).padStart(2, '0')
  if (time) {
    const h = String(time.hours || 0).padStart(2, '0')
    const min = String(time.minutes || 0).padStart(2, '0')
    return `${y}-${m}-${d}T${h}:${min}:00Z`
  }
  return `${y}-${m}-${d}T00:00:00Z`
}
