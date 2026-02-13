import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateGBPPost } from '@/lib/ai/generate-post'
import { generateTopicPool } from '@/lib/ai/generate-topics'
import { generatePostImage } from '@/lib/ideogram'

export const maxDuration = 300

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000'
const MIN_TOPIC_POOL_SIZE = 10
const DEFAULT_TOPIC_POOL_SIZE = 50

/**
 * GET /api/cron/post-generate
 *
 * Monthly cron that auto-generates Google Business Profile post batches.
 *
 * For each location with posts_per_month > 0 and an active GBP profile:
 * 1. Checks/replenishes the topic pool (generates ~50 if low)
 * 2. Picks N unused topics from the pool
 * 3. Generates copy (Haiku) + image (Ideogram) for each
 * 4. Inserts into gbp_post_queue as 'draft' with staggered scheduled_for dates
 *
 * Schedule: 1st of each month at 10:00 UTC
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

  // Get locations with posts_per_month > 0 and active GBP profiles
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name, city, state, org_id, posts_per_month, brand_voice, design_style, primary_color, secondary_color')
    .gt('posts_per_month', 0)
    .eq('active', true)

  if (!locations || locations.length === 0) {
    return NextResponse.json({ ok: true, generated: 0, message: 'No locations with posts configured' })
  }

  const locationIds = locations.map((l) => l.id)
  const orgIds = Array.from(new Set(locations.map((l) => l.org_id)))

  // Get GBP profiles
  const { data: profiles } = await supabase
    .from('gbp_profiles')
    .select('location_id, business_name, description, primary_category_name, additional_categories')
    .in('location_id', locationIds)
    .eq('sync_status', 'active')

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ ok: true, generated: 0, message: 'No active GBP profiles' })
  }

  const profileMap = new Map(profiles.map((p) => [p.location_id, p]))

  // Get org-level brand configs
  const { data: brandConfigs } = await supabase
    .from('brand_config')
    .select('*')
    .in('org_id', orgIds)

  const brandMap = new Map((brandConfigs || []).map((b: any) => [b.org_id, b]))

  // Skip locations that already have draft/client_review posts
  const { data: existingDrafts } = await supabase
    .from('gbp_post_queue')
    .select('location_id')
    .in('location_id', locationIds)
    .in('status', ['draft', 'client_review'])

  const hasDrafts = new Set((existingDrafts || []).map((d) => d.location_id))

  // Get recent posts for AI context
  const { data: recentPosts } = await supabase
    .from('gbp_posts')
    .select('location_id, summary')
    .in('location_id', locationIds)
    .order('create_time', { ascending: false })
    .limit(200)

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
  let topicsGenerated = 0

  for (const location of locations) {
    if (hasDrafts.has(location.id)) {
      skipped++
      continue
    }

    const profile = profileMap.get(location.id)
    if (!profile) {
      skipped++
      continue
    }

    const orgBrand = brandMap.get(location.org_id)
    const brandVoice = location.brand_voice || orgBrand?.brand_voice || null
    const designStyle = location.design_style || orgBrand?.design_style || null
    const primaryColor = location.primary_color || orgBrand?.primary_color || null
    const secondaryColor = location.secondary_color || orgBrand?.secondary_color || null
    const fontStyle = orgBrand?.font_style || null

    const categories = [
      profile.primary_category_name,
      ...(profile.additional_categories || []).map((c: any) => c.displayName),
    ].filter(Boolean)

    const businessName = profile.business_name || location.name
    const businessType = profile.primary_category_name || 'local business'

    // 1. Check topic pool — replenish if low
    const { data: availableTopics } = await supabase
      .from('gbp_post_topics')
      .select('id, topic')
      .eq('location_id', location.id)
      .eq('active', true)
      .is('used_at', null)
      .order('created_at', { ascending: true })

    let topics = availableTopics || []

    if (topics.length < location.posts_per_month || topics.length < MIN_TOPIC_POOL_SIZE) {
      const { data: allTopics } = await supabase
        .from('gbp_post_topics')
        .select('topic')
        .eq('location_id', location.id)

      const existingTopicStrings = (allTopics || []).map((t) => t.topic)
      const needed = Math.max(DEFAULT_TOPIC_POOL_SIZE - topics.length, location.posts_per_month)

      try {
        const newTopics = await generateTopicPool({
          businessName,
          businessDescription: profile.description,
          city: location.city,
          state: location.state,
          categories,
          brandVoice,
          existingTopics: existingTopicStrings,
          count: needed,
        })

        if (newTopics.length > 0) {
          const rows = newTopics.map((topic) => ({
            location_id: location.id,
            topic,
            source: 'ai' as const,
          }))

          const { data: inserted } = await supabase
            .from('gbp_post_topics')
            .insert(rows)
            .select('id, topic')

          if (inserted) {
            topics = [...topics, ...inserted]
            topicsGenerated += inserted.length
          }
        }
      } catch (err) {
        console.error(`[post-generate] Failed to generate topics for ${location.id}:`, err)
        continue
      }
    }

    // 2. Pick N unused topics
    const postsToGenerate = Math.min(location.posts_per_month, topics.length)
    const selectedTopics = topics.slice(0, postsToGenerate)

    // 3. Generate copy + image for each, stagger scheduling
    const now = new Date()
    const intervalDays = location.posts_per_month >= 4 ? 7 : 30

    for (let i = 0; i < selectedTopics.length; i++) {
      const topicRow = selectedTopics[i]

      try {
        const { summary, headline } = await generateGBPPost({
          businessName,
          businessDescription: profile.description,
          city: location.city,
          state: location.state,
          categories,
          recentPostSummaries: recentByLocation.get(location.id) || [],
          topic: topicRow.topic,
          brandVoice,
        })

        // Generate image (skip if no API key)
        let mediaUrl: string | null = null
        if (process.env.IDEOGRAM_API_KEY) {
          try {
            mediaUrl = await generatePostImage({
              headline,
              subtext: [location.city, location.state].filter(Boolean).join(', ') || businessName,
              designStyle,
              primaryColor,
              secondaryColor,
              fontStyle,
              businessType,
            })
          } catch (imageErr) {
            console.error(`[post-generate] Image generation failed for ${location.id}:`, imageErr)
          }
        }

        // Stagger: first post ~3 days out, then at intervalDays spacing
        const scheduledFor = new Date(now.getTime() + (3 + i * intervalDays) * 24 * 60 * 60 * 1000)
        scheduledFor.setTime(scheduledFor.getTime() + Math.random() * 12 * 60 * 60 * 1000)

        const { data: queueEntry } = await supabase
          .from('gbp_post_queue')
          .insert({
            location_id: location.id,
            topic_type: 'STANDARD',
            summary,
            media_url: mediaUrl,
            status: 'draft',
            scheduled_for: scheduledFor.toISOString(),
            queued_by: SYSTEM_USER_ID,
            topic_id: topicRow.id,
            source: 'ai',
          })
          .select('id')
          .single()

        // Mark topic as used
        await supabase
          .from('gbp_post_topics')
          .update({
            used_at: new Date().toISOString(),
            used_in_queue_id: queueEntry?.id || null,
            use_count: 1,
          })
          .eq('id', topicRow.id)

        generated++
      } catch (err) {
        console.error(`[post-generate] Failed for location ${location.id}, topic "${topicRow.topic}":`, err)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    locations_processed: locations.length,
    generated,
    skipped,
    topics_generated: topicsGenerated,
  })
}
