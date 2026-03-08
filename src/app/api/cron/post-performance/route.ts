import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 120

/**
 * GET /api/cron/post-performance
 *
 * Weekly cron that analyzes published GBP post performance by location.
 * Groups posts from the last 60 days by topic_type, calculates distribution,
 * and logs insights to agent_activity_log for each location.
 *
 * Schedule: Weekly
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const apiKey = process.env.CRON_SECRET

  if (apiKey && authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()

  // Get published posts from the last 60 days
  const { data: posts } = await supabase
    .from('gbp_posts')
    .select('id, location_id, topic_type, summary, state, create_time, search_url')
    .eq('state', 'LIVE')
    .gte('create_time', sixtyDaysAgo)

  if (!posts || posts.length === 0) {
    return NextResponse.json({ processed: 0, locations: 0, insights_logged: 0 })
  }

  // Group by location
  const byLocation = new Map<string, typeof posts>()
  for (const post of posts) {
    const existing = byLocation.get(post.location_id) || []
    existing.push(post)
    byLocation.set(post.location_id, existing)
  }

  let insightsLogged = 0

  for (const [locationId, locationPosts] of byLocation) {
    if (locationPosts.length < 3) continue // Need enough data for meaningful analysis

    // Analyze topic type distribution
    const typeCount: Record<string, number> = {}
    for (const p of locationPosts) {
      const type = p.topic_type || 'STANDARD'
      typeCount[type] = (typeCount[type] || 0) + 1
    }

    // Calculate posting cadence
    const totalPosts = locationPosts.length
    const postsPerWeek = Math.round((totalPosts / 8.5) * 10) / 10 // ~60 days = 8.5 weeks

    // Count posts with search URLs (indicates they were indexed/visible)
    const withSearchUrl = locationPosts.filter((p) => p.search_url).length

    const typeMix = Object.entries(typeCount)
      .map(([t, c]) => `${t}:${c}`)
      .join(', ')

    await supabase.from('agent_activity_log').insert({
      location_id: locationId,
      action_type: 'post_performance',
      status: 'completed',
      summary: `${totalPosts} posts in 60d (${postsPerWeek}/week). Mix: ${typeMix}. ${withSearchUrl}/${totalPosts} indexed.`,
      details: {
        total_posts: totalPosts,
        posts_per_week: postsPerWeek,
        type_distribution: typeCount,
        indexed_count: withSearchUrl,
        period: '60d',
      },
    })
    insightsLogged++
  }

  return NextResponse.json({
    processed: posts.length,
    locations: byLocation.size,
    insights_logged: insightsLogged,
  })
}
