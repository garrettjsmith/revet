import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAgencyAdmin } from '@/lib/locations'

const DEFAULTS = {
  enabled: false,
  review_replies: 'queue',
  profile_updates: 'queue',
  post_publishing: 'queue',
  auto_reply_min_rating: 4,
  auto_reply_max_rating: 5,
  escalate_below_rating: 3,
  tone: 'professional and friendly',
  business_context: null,
}

/**
 * GET /api/locations/[locationId]/agent
 *
 * Returns agent config for a location.
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

  const { data: location } = await supabase
    .from('locations')
    .select('id')
    .eq('id', params.locationId)
    .single()

  if (!location) {
    return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  }

  const adminClient = createAdminClient()
  const { data: config } = await adminClient
    .from('location_agent_config')
    .select('*')
    .eq('location_id', params.locationId)
    .single()

  // Also fetch recent activity
  const { data: recentActivity } = await adminClient
    .from('agent_activity_log')
    .select('*')
    .eq('location_id', params.locationId)
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json({
    config: config || { location_id: params.locationId, ...DEFAULTS },
    recent_activity: recentActivity || [],
  })
}

/**
 * PUT /api/locations/[locationId]/agent
 *
 * Upserts agent config. Agency admin only.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const body = await request.json()
  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from('location_agent_config')
    .upsert(
      {
        location_id: params.locationId,
        enabled: body.enabled ?? DEFAULTS.enabled,
        review_replies: body.review_replies ?? DEFAULTS.review_replies,
        profile_updates: body.profile_updates ?? DEFAULTS.profile_updates,
        post_publishing: body.post_publishing ?? DEFAULTS.post_publishing,
        auto_reply_min_rating: body.auto_reply_min_rating ?? DEFAULTS.auto_reply_min_rating,
        auto_reply_max_rating: body.auto_reply_max_rating ?? DEFAULTS.auto_reply_max_rating,
        escalate_below_rating: body.escalate_below_rating ?? DEFAULTS.escalate_below_rating,
        tone: body.tone ?? DEFAULTS.tone,
        business_context: body.business_context ?? DEFAULTS.business_context,
      },
      { onConflict: 'location_id' }
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to save config' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, config: data })
}

/**
 * POST /api/locations/[locationId]/agent
 *
 * Trigger an on-demand agent run for this location.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const { runAgentForLocation } = await import('@/lib/agent')
  const adminClient = createAdminClient()

  const { data: config } = await adminClient
    .from('location_agent_config')
    .select('*')
    .eq('location_id', params.locationId)
    .single()

  const agentConfig = config
    ? {
        location_id: config.location_id,
        enabled: true,
        review_replies: config.review_replies || 'queue',
        profile_updates: config.profile_updates || 'queue',
        post_publishing: config.post_publishing || 'queue',
        auto_reply_min_rating: config.auto_reply_min_rating ?? 4,
        auto_reply_max_rating: config.auto_reply_max_rating ?? 5,
        escalate_below_rating: config.escalate_below_rating ?? 3,
        tone: config.tone || 'professional and friendly',
        business_context: config.business_context,
      }
    : {
        location_id: params.locationId,
        enabled: true,
        review_replies: 'queue' as const,
        profile_updates: 'queue' as const,
        post_publishing: 'queue' as const,
        auto_reply_min_rating: 4,
        auto_reply_max_rating: 5,
        escalate_below_rating: 3,
        tone: 'professional and friendly',
        business_context: null,
      }

  const result = await runAgentForLocation(params.locationId, agentConfig)

  return NextResponse.json(result)
}
