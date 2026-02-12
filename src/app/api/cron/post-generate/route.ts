import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateGBPPost } from '@/lib/ai/generate-post'

export const maxDuration = 120

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000'

/**
 * GET /api/cron/post-generate
 *
 * Weekly cron that auto-generates Google Business Profile post drafts
 * for premium-tier locations. Posts are inserted into gbp_post_queue
 * as pending items that appear in the work queue for review.
 *
 * Only generates for locations that:
 * - Have service_tier = 'premium'
 * - Have a linked GBP profile with sync_status = 'active'
 * - Don't already have a pending post in the queue
 *
 * Schedule: Weekly on Mondays at 10:00 UTC
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

  // Get premium-tier locations with active GBP profiles
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name, city, state, org_id, service_tier')
    .eq('service_tier', 'premium')
    .eq('active', true)

  if (!locations || locations.length === 0) {
    return NextResponse.json({ ok: true, generated: 0, message: 'No premium locations' })
  }

  const locationIds = locations.map((l) => l.id)

  // Get GBP profiles for these locations
  const { data: profiles } = await supabase
    .from('gbp_profiles')
    .select('location_id, business_name, description, primary_category_name, additional_categories')
    .in('location_id', locationIds)
    .eq('sync_status', 'active')

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ ok: true, generated: 0, message: 'No active GBP profiles' })
  }

  const profileMap = new Map(profiles.map((p) => [p.location_id, p]))

  // Check which locations already have pending posts
  const { data: pendingPosts } = await supabase
    .from('gbp_post_queue')
    .select('location_id')
    .in('location_id', locationIds)
    .eq('status', 'pending')

  const hasPending = new Set((pendingPosts || []).map((p) => p.location_id))

  // Get recent posts for context (avoid repeating topics)
  const { data: recentPosts } = await supabase
    .from('gbp_posts')
    .select('location_id, summary')
    .in('location_id', locationIds)
    .order('create_time', { ascending: false })
    .limit(100)

  const recentByLocation = new Map<string, string[]>()
  for (const post of recentPosts || []) {
    if (!recentByLocation.has(post.location_id)) {
      recentByLocation.set(post.location_id, [])
    }
    const arr = recentByLocation.get(post.location_id)!
    if (arr.length < 5 && post.summary) {
      arr.push(post.summary)
    }
  }

  let generated = 0
  let skipped = 0

  for (const location of locations) {
    // Skip if already has a pending post
    if (hasPending.has(location.id)) {
      skipped++
      continue
    }

    const profile = profileMap.get(location.id)
    if (!profile) {
      skipped++
      continue
    }

    const categories = [
      profile.primary_category_name,
      ...(profile.additional_categories || []).map((c: any) => c.displayName),
    ].filter(Boolean)

    try {
      const summary = await generateGBPPost({
        businessName: profile.business_name || location.name,
        businessDescription: profile.description,
        city: location.city,
        state: location.state,
        categories,
        recentPostSummaries: recentByLocation.get(location.id) || [],
      })

      // Insert into post queue as pending (shows up in work queue for approval)
      await supabase
        .from('gbp_post_queue')
        .insert({
          location_id: location.id,
          topic_type: 'STANDARD',
          summary,
          status: 'pending',
          queued_by: SYSTEM_USER_ID,
        })

      generated++
    } catch (err) {
      console.error(`[post-generate] Failed for location ${location.id}:`, err)
    }
  }

  return NextResponse.json({
    ok: true,
    premium_locations: locations.length,
    generated,
    skipped,
  })
}
