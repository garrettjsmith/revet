import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAgencyAdmin } from '@/lib/locations'

/**
 * GET /api/locations/[locationId]/autopilot
 *
 * Returns autopilot config for a location. Accessible to any org member
 * with location access. Returns defaults if no config exists.
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

  // Verify location access
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
    .from('review_autopilot_config')
    .select('*')
    .eq('location_id', params.locationId)
    .single()

  // Return config or defaults
  return NextResponse.json({
    config: config || {
      location_id: params.locationId,
      enabled: false,
      auto_reply_ratings: [4, 5],
      tone: 'professional and friendly',
      business_context: null,
      delay_min_minutes: 30,
      delay_max_minutes: 180,
      require_approval: false,
    },
  })
}

/**
 * PUT /api/locations/[locationId]/autopilot
 *
 * Upserts autopilot config. Agency admin only.
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
  const {
    enabled,
    auto_reply_ratings,
    tone,
    business_context,
    delay_min_minutes,
    delay_max_minutes,
    require_approval,
  } = body

  const adminClient = createAdminClient()

  // Verify location exists
  const { data: location } = await adminClient
    .from('locations')
    .select('id')
    .eq('id', params.locationId)
    .single()

  if (!location) {
    return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  }

  const { data, error } = await adminClient
    .from('review_autopilot_config')
    .upsert(
      {
        location_id: params.locationId,
        enabled: enabled ?? false,
        auto_reply_ratings: auto_reply_ratings ?? [4, 5],
        tone: tone || 'professional and friendly',
        business_context: business_context || null,
        delay_min_minutes: delay_min_minutes ?? 30,
        delay_max_minutes: delay_max_minutes ?? 180,
        require_approval: require_approval ?? false,
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
