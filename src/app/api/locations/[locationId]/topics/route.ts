import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAgencyAdmin } from '@/lib/locations'
import { generateTopicPool } from '@/lib/ai/generate-topics'

/**
 * GET /api/locations/[locationId]/topics
 * Returns all topics for a location.
 *
 * POST /api/locations/[locationId]/topics
 * Generates a batch of AI topics or adds a manual topic.
 *
 * DELETE /api/locations/[locationId]/topics
 * Deactivates a topic (body: { topic_id: string }).
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

  // Verify access
  const { data: location } = await supabase
    .from('locations')
    .select('id')
    .eq('id', params.locationId)
    .single()

  if (!location) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const adminClient = createAdminClient()
  const { data: topics } = await adminClient
    .from('gbp_post_topics')
    .select('*')
    .eq('location_id', params.locationId)
    .eq('active', true)
    .order('used_at', { ascending: true, nullsFirst: true })

  const availableCount = (topics || []).filter((t) => !t.used_at).length
  const usedCount = (topics || []).filter((t) => t.used_at).length

  return NextResponse.json({
    topics: topics || [],
    available: availableCount,
    used: usedCount,
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const body = await request.json()
  const { action, topic, count } = body as {
    action: 'generate' | 'add_manual'
    topic?: string
    count?: number
  }

  const adminClient = createAdminClient()

  if (action === 'add_manual') {
    if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
      return NextResponse.json({ error: 'Topic required' }, { status: 400 })
    }

    const { data: inserted } = await adminClient
      .from('gbp_post_topics')
      .insert({
        location_id: params.locationId,
        topic: topic.trim(),
        source: 'manual',
      })
      .select()
      .single()

    return NextResponse.json({ ok: true, topic: inserted })
  }

  if (action === 'generate') {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
    }

    // Get location + profile + brand info
    const { data: location } = await adminClient
      .from('locations')
      .select('id, name, city, state, org_id, brand_voice')
      .eq('id', params.locationId)
      .single()

    if (!location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    const { data: profile } = await adminClient
      .from('gbp_profiles')
      .select('business_name, description, primary_category_name, additional_categories')
      .eq('location_id', params.locationId)
      .single()

    const { data: brandConfig } = await adminClient
      .from('brand_config')
      .select('brand_voice')
      .eq('org_id', location.org_id)
      .single()

    const { data: existingTopics } = await adminClient
      .from('gbp_post_topics')
      .select('topic')
      .eq('location_id', params.locationId)

    const categories = profile ? [
      profile.primary_category_name,
      ...(profile.additional_categories || []).map((c: any) => c.displayName),
    ].filter(Boolean) : []

    const generateCount = count || 50

    const newTopics = await generateTopicPool({
      businessName: profile?.business_name || location.name,
      businessDescription: profile?.description || null,
      city: location.city,
      state: location.state,
      categories,
      brandVoice: location.brand_voice || brandConfig?.brand_voice || null,
      existingTopics: (existingTopics || []).map((t) => t.topic),
      count: generateCount,
    })

    if (newTopics.length > 0) {
      const rows = newTopics.map((t) => ({
        location_id: params.locationId,
        topic: t,
        source: 'ai' as const,
      }))

      const { data: inserted } = await adminClient
        .from('gbp_post_topics')
        .insert(rows)
        .select()

      return NextResponse.json({ ok: true, generated: inserted?.length || 0, topics: inserted })
    }

    return NextResponse.json({ ok: true, generated: 0, topics: [] })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const body = await request.json()
  const { topic_id } = body

  if (!topic_id) {
    return NextResponse.json({ error: 'topic_id required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  await adminClient
    .from('gbp_post_topics')
    .update({ active: false })
    .eq('id', topic_id)
    .eq('location_id', params.locationId)

  return NextResponse.json({ ok: true })
}
