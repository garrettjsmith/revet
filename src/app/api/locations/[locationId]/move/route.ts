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
  try {
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
      .select('id, name, slug')
      .eq('id', orgId)
      .single()

    if (!targetOrg) {
      return NextResponse.json({ error: 'Target organization not found' }, { status: 404 })
    }

    // Check if already in target org
    if (location.org_id === orgId) {
      return NextResponse.json({ error: 'Location is already in this organization' }, { status: 400 })
    }

    // Get old org name for audit log
    const { data: oldOrg } = await adminClient
      .from('organizations')
      .select('name')
      .eq('id', location.org_id)
      .single()

    // Move location — direct updates via admin client (bypasses RLS)
    // This is safe because we already verified agency admin above.

    // 1. Update the location's org_id
    const { error: locError } = await adminClient
      .from('locations')
      .update({ org_id: orgId })
      .eq('id', locationId)

    if (locError) {
      console.error('[location/move] Failed to update location:', locError)
      return NextResponse.json({ error: 'Failed to move location' }, { status: 500 })
    }

    // 2. Update review profiles (has both org_id and location_id)
    await adminClient
      .from('review_profiles')
      .update({ org_id: orgId })
      .eq('location_id', locationId)

    // 3. Update integration mappings (may not have rows — that's fine)
    await adminClient
      .from('agency_integration_mappings')
      .update({ org_id: orgId })
      .eq('location_id', locationId)

    // 4. Update form templates (has both org_id and location_id)
    await adminClient
      .from('form_templates')
      .update({ org_id: orgId })
      .eq('location_id', locationId)

    // 5. Record audit log entry (table may not exist yet — ignore errors)
    await adminClient
      .from('audit_log')
      .insert({
        actor_id: user.id,
        actor_email: user.email,
        action: 'location.moved',
        resource_type: 'location',
        resource_id: locationId,
        metadata: {
          from_org_id: location.org_id,
          to_org_id: orgId,
          from_org_name: oldOrg?.name || 'Unknown',
          to_org_name: targetOrg.name,
        },
      })

    return NextResponse.json({
      ok: true,
      location_id: locationId,
      new_org_slug: targetOrg.slug,
    })
  } catch (error) {
    console.error('[location/move] Unexpected error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
