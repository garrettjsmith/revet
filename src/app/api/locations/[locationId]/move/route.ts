import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 60

/**
 * POST /api/locations/[locationId]/move
 *
 * Move a location to a different organization.
 * Agency admin only.
 *
 * Body: {
 *   org_id: string
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  const { locationId } = params

  // Verify agency admin
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('org_members')
    .select('is_agency_admin')
    .eq('user_id', user.id)
    .eq('is_agency_admin', true)
    .limit(1)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const body = await request.json()
  const { org_id: orgId } = body

  if (!orgId) {
    return NextResponse.json({ error: 'org_id is required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Validate location exists
  const { data: location } = await adminClient
    .from('locations')
    .select('id, name, org_id')
    .eq('id', locationId)
    .single()

  if (!location) {
    return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  }

  // Validate target org exists
  const { data: targetOrg } = await adminClient
    .from('organizations')
    .select('id, slug')
    .eq('id', orgId)
    .single()

  if (!targetOrg) {
    return NextResponse.json({ error: 'Target organization not found' }, { status: 404 })
  }

  // Check if already in target org
  if (location.org_id === orgId) {
    return NextResponse.json({ error: 'Location is already in this organization' }, { status: 400 })
  }

  // Call the RPC function to move the location
  // Use authenticated client so auth.uid() is available inside SECURITY DEFINER function
  const { error: rpcError } = await supabase.rpc('move_location_to_org', {
    p_location_id: locationId,
    p_new_org_id: orgId,
  })

  if (rpcError) {
    console.error('[location/move] RPC error:', rpcError)
    return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    location_id: locationId,
    new_org_slug: targetOrg.slug,
  })
}
