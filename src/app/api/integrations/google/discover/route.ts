import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { discoverAllLocations } from '@/lib/google/accounts'
import { GoogleAuthError } from '@/lib/google/auth'

// Allow up to 60s for large accounts (600+ locations)
export const maxDuration = 60

/**
 * POST /api/integrations/google/discover
 *
 * Discovers all GBP accounts and locations accessible to the connected Google account.
 * Returns them for the mapping UI.
 */
export async function POST(request: NextRequest) {
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

  try {
    const { accounts, locations } = await discoverAllLocations()

    // Also fetch existing mappings so UI can show what's already mapped
    const adminClient = createAdminClient()
    const { data: existingMappings } = await adminClient
      .from('agency_integration_mappings')
      .select('external_resource_id, location_id, org_id')
      .eq('resource_type', 'gbp_location')

    return NextResponse.json({
      accounts,
      locations,
      existingMappings: existingMappings || [],
    })
  } catch (err) {
    if (err instanceof GoogleAuthError && err.code === 'reconnect_required') {
      return NextResponse.json(
        { error: 'Google connection expired. Please reconnect.' },
        { status: 401 }
      )
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[google/discover] Error:', message)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
