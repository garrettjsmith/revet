import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tierIncludes } from '@/lib/tiers'
import type { ServiceTier } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/locations/[locationId]/service-tier
 *
 * Updates a location's service tier. Agency admin only.
 * Body: { service_tier: 'starter' | 'standard' | 'premium' }
 *
 * On downgrade, disables features not included in the new tier:
 * - Starter: disables autopilot, sets posts_per_month to 0
 * - Standard: disables auto-send (sets require_approval to true), sets posts_per_month to 0
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ locationId: string }> }
) {
  const { locationId } = await params

  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: adminCheck } = await supabase
    .from('org_members')
    .select('is_agency_admin')
    .eq('user_id', user.id)
    .eq('is_agency_admin', true)
    .limit(1)

  if (!adminCheck || adminCheck.length === 0) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const body = await request.json()
  const { service_tier } = body as { service_tier: string }

  if (!['starter', 'standard', 'premium'].includes(service_tier)) {
    return NextResponse.json({ error: 'Invalid service tier' }, { status: 400 })
  }

  const newTier = service_tier as ServiceTier
  const adminClient = createAdminClient()

  // Update the tier
  const locationUpdate: Record<string, unknown> = { service_tier: newTier }

  // If post generation not included in new tier, zero out posts_per_month
  if (!tierIncludes(newTier, 'post_generation')) {
    locationUpdate.posts_per_month = 0
  }

  const { error } = await adminClient
    .from('locations')
    .update(locationUpdate)
    .eq('id', locationId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Disable features not included in the new tier
  const disabled: string[] = []

  // If AI drafts not included, disable autopilot entirely
  if (!tierIncludes(newTier, 'ai_reply_drafts')) {
    await adminClient
      .from('review_autopilot_config')
      .update({ enabled: false })
      .eq('location_id', locationId)
    disabled.push('autopilot')
  }
  // If autopilot auto-send not included, force require_approval
  else if (!tierIncludes(newTier, 'review_autopilot')) {
    await adminClient
      .from('review_autopilot_config')
      .update({ require_approval: true })
      .eq('location_id', locationId)
    disabled.push('auto-send')
  }

  return NextResponse.json({ ok: true, service_tier: newTier, disabled })
}
