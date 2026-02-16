import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agency/locations/search
 *
 * Paginated location search for the feed filter combobox.
 * Searches name and city. Optional org_id to scope results.
 *
 * Query params:
 *   q: search string (matches location name or city, case-insensitive)
 *   org_id: optional org filter
 *   offset: pagination offset (default: 0)
 *   limit: results per page (default: 20, max: 50)
 */
export async function GET(request: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check agency admin status
  const { data: adminCheck } = await supabase
    .from('org_members')
    .select('is_agency_admin')
    .eq('user_id', user.id)
    .eq('is_agency_admin', true)
    .limit(1)

  const isAgencyAdmin = adminCheck && adminCheck.length > 0

  let scopedOrgIds: string[] | null = null

  if (!isAgencyAdmin) {
    const adminClient = createAdminClient()
    const { data: managerAssignments } = await adminClient
      .from('org_account_managers')
      .select('org_id')
      .eq('user_id', user.id)

    if (!managerAssignments || managerAssignments.length === 0) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    scopedOrgIds = managerAssignments.map((a: { org_id: string }) => a.org_id)
  }

  const adminClient = createAdminClient()
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''
  const orgId = searchParams.get('org_id') || null
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10))
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50)

  let query = adminClient
    .from('locations')
    .select('id, name, city, state, org_id', { count: 'exact' })
    .eq('active', true)

  // Apply org filter (explicit or from scope)
  if (orgId) {
    // Verify user has access to this org if scoped
    if (scopedOrgIds && !scopedOrgIds.includes(orgId)) {
      return NextResponse.json({ locations: [], has_more: false })
    }
    query = query.eq('org_id', orgId)
  } else if (scopedOrgIds) {
    query = query.in('org_id', scopedOrgIds)
  }

  if (q.trim()) {
    // Search name OR city
    query = query.or(`name.ilike.%${q.trim()}%,city.ilike.%${q.trim()}%`)
  }

  const { data, count } = await query
    .order('name')
    .range(offset, offset + limit - 1)

  return NextResponse.json({
    locations: (data || []).map((l: { id: string; name: string; city: string | null; state: string | null }) => ({
      id: l.id,
      name: l.name,
      city: l.city,
      state: l.state,
    })),
    has_more: (count || 0) > offset + limit,
  })
}
