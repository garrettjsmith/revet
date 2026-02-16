import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agency/feed/check
 *
 * Lightweight polling endpoint — returns count of new items since a given timestamp.
 * Used by the feed UI to show "N new items" banner without refetching all data.
 *
 * Query params:
 *   since: ISO timestamp — count items created after this
 *   scope: 'all' | 'mine'
 *   org_id: optional org filter
 */
export async function GET(request: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminClient = createAdminClient()

  // Check access
  const { data: adminCheck } = await supabase
    .from('org_members')
    .select('is_agency_admin')
    .eq('user_id', user.id)
    .eq('is_agency_admin', true)
    .limit(1)

  const isAgencyAdmin = adminCheck && adminCheck.length > 0

  const { data: managerAssignments } = await adminClient
    .from('org_account_managers')
    .select('org_id')
    .eq('user_id', user.id)

  const managedOrgIds = (managerAssignments || []).map((a: { org_id: string }) => a.org_id)

  if (!isAgencyAdmin && managedOrgIds.length === 0) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const since = searchParams.get('since')
  const scope = searchParams.get('scope') || 'all'
  const orgIdFilter = searchParams.get('org_id') || null

  if (!since) {
    return NextResponse.json({ new_count: 0 })
  }

  // Determine scoped location IDs
  let scopedLocationIds: string[] | null = null

  if (!isAgencyAdmin || scope === 'mine') {
    if (managedOrgIds.length === 0) {
      return NextResponse.json({ new_count: 0 })
    }

    const { data: locations } = await adminClient
      .from('locations')
      .select('id')
      .in('org_id', managedOrgIds)
      .eq('active', true)

    scopedLocationIds = (locations || []).map((l: { id: string }) => l.id)
    if (scopedLocationIds.length === 0) {
      return NextResponse.json({ new_count: 0 })
    }
  }

  if (orgIdFilter) {
    const { data: orgLocations } = await adminClient
      .from('locations')
      .select('id')
      .eq('org_id', orgIdFilter)
      .eq('active', true)

    const orgLocationIds = (orgLocations || []).map((l: { id: string }) => l.id)
    if (scopedLocationIds !== null) {
      scopedLocationIds = scopedLocationIds.filter((id: string) => orgLocationIds.includes(id))
    } else {
      scopedLocationIds = orgLocationIds
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyScope(query: any) {
    if (scopedLocationIds) {
      return query.in('location_id', scopedLocationIds)
    }
    return query
  }

  // Count new items across key tables in parallel
  const [reviewCount, postCount, profileOptCount] = await Promise.all([
    applyScope(
      adminClient
        .from('reviews')
        .select('id', { count: 'exact', head: true })
        .eq('platform', 'google')
        .eq('status', 'new')
        .is('reply_body', null)
        .gt('published_at', since)
    ),
    applyScope(
      adminClient
        .from('gbp_post_queue')
        .select('id', { count: 'exact', head: true })
        .in('status', ['draft', 'client_review', 'pending'])
        .gt('created_at', since)
    ),
    adminClient
      .from('profile_recommendations')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'client_review'])
      .gt('created_at', since),
  ])

  const newCount =
    (reviewCount.count || 0) +
    (postCount.count || 0) +
    (profileOptCount.count || 0)

  return NextResponse.json({ new_count: newCount })
}
