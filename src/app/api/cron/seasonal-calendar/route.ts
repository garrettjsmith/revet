import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateSeasonalTopics } from '@/lib/ai/profile-optimize'
import { verifyCronSecret } from '@/lib/cron-auth'

export const maxDuration = 300

/**
 * GET /api/cron/seasonal-calendar
 *
 * Monthly cron (1st of each month) that generates seasonal/holiday-aware
 * post topics for the upcoming month and seeds them into gbp_post_topics.
 *
 * For each active location with posts_per_month > 0:
 * 1. Gets the GBP profile for business name + category
 * 2. Generates 3-5 seasonal topics via Claude Haiku
 * 3. Inserts into gbp_post_topics with source='seasonal'
 * 4. Logs to agent_activity_log
 *
 * Schedule: Monthly (1st of each month)
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request)
  if (authError) return authError

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  }

  const supabase = createAdminClient()

  // Target the upcoming month
  const now = new Date()
  const targetMonth = now.getMonth() + 2 // getMonth() is 0-indexed, we want next month as 1-indexed
  const targetYear = targetMonth > 12 ? now.getFullYear() + 1 : now.getFullYear()
  const month = targetMonth > 12 ? targetMonth - 12 : targetMonth

  // Get all active locations with post generation enabled
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name, city, state')
    .gt('posts_per_month', 0)
    .eq('active', true)

  if (!locations || locations.length === 0) {
    return NextResponse.json({ ok: true, generated: 0, message: 'No active locations with posts enabled' })
  }

  const locationIds = locations.map((l) => l.id)

  // Get GBP profiles for business name + category
  const { data: profiles } = await supabase
    .from('gbp_profiles')
    .select('location_id, business_name, primary_category_name')
    .in('location_id', locationIds)
    .eq('sync_status', 'active')

  const profileMap = new Map((profiles || []).map((p) => [p.location_id, p]))

  let totalTopics = 0
  let locationsProcessed = 0
  let errors = 0

  for (const location of locations) {
    const profile = profileMap.get(location.id)
    if (!profile) continue

    const businessName = profile.business_name || location.name

    try {
      const topics = await generateSeasonalTopics({
        businessName,
        category: profile.primary_category_name,
        city: location.city,
        state: location.state,
        month,
        year: targetYear,
      })

      if (topics.length === 0) continue

      const rows = topics.map((t) => ({
        location_id: location.id,
        topic: t.topic,
        source: 'seasonal' as const,
      }))

      const { data: inserted } = await supabase
        .from('gbp_post_topics')
        .insert(rows)
        .select('id')

      const insertedCount = inserted?.length || 0
      totalTopics += insertedCount
      locationsProcessed++

      // Log to agent_activity_log (deduplicate by location + action_type + date)
      if (insertedCount > 0) {
        const today = new Date().toISOString().split('T')[0]
        const { count: existingCount } = await supabase
          .from('agent_activity_log')
          .select('id', { count: 'exact', head: true })
          .eq('location_id', location.id)
          .eq('action_type', 'post_generated')
          .gte('created_at', today)

        if ((existingCount || 0) === 0) {
          await supabase.from('agent_activity_log').insert({
            location_id: location.id,
            action_type: 'post_generated',
            status: 'completed',
            summary: `Generated ${insertedCount} seasonal topics for ${month}/${targetYear}`,
            details: {
              month,
              year: targetYear,
              topics: topics.map((t) => ({ topic: t.topic, type: t.type, suggested_date: t.suggested_date })),
            },
          })
        }
      }
    } catch (err) {
      console.error(`[seasonal-calendar] Failed for location ${location.id}:`, err)
      errors++
    }
  }

  return NextResponse.json({
    ok: true,
    month,
    year: targetYear,
    locations_processed: locationsProcessed,
    topics_generated: totalTopics,
    errors,
  })
}
