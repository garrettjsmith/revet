import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/locations/[locationId]/service-tier
 *
 * Updates a location's service tier. Agency admin only.
 * Body: { service_tier: 'starter' | 'standard' | 'premium' }
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

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('locations')
    .update({ service_tier })
    .eq('id', locationId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, service_tier })
}
