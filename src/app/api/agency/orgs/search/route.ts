import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agency/orgs/search
 *
 * Paginated org search for the feed filter combobox.
 * Returns orgs the user has access to, filtered by search query.
 *
 * Query params:
 *   q: search string (matches org name, case-insensitive)
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

  if (!isAgencyAdmin) {
    // Account managers can also search, but only their assigned orgs
    const adminClient = createAdminClient()
    const { data: managerAssignments } = await adminClient
      .from('org_account_managers')
      .select('org_id')
      .eq('user_id', user.id)

    if (!managerAssignments || managerAssignments.length === 0) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    return searchOrgs(request, managerAssignments.map((a: { org_id: string }) => a.org_id))
  }

  return searchOrgs(request, null)
}

async function searchOrgs(request: NextRequest, restrictToOrgIds: string[] | null) {
  const adminClient = createAdminClient()
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10))
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50)

  let query = adminClient
    .from('organizations')
    .select('id, name, slug', { count: 'exact' })

  if (restrictToOrgIds) {
    query = query.in('id', restrictToOrgIds)
  }

  if (q.trim()) {
    query = query.ilike('name', `%${q.trim()}%`)
  }

  const { data, count } = await query
    .order('name')
    .range(offset, offset + limit - 1)

  return NextResponse.json({
    orgs: (data || []).map((o: { id: string; name: string; slug: string }) => ({ id: o.id, name: o.name, slug: o.slug })),
    has_more: (count || 0) > offset + limit,
  })
}
