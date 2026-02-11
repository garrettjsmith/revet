import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/team?org_id=X
 * Returns all team members with emails, location access, and notification subscriptions.
 * Agency admin only.
 */
export async function GET(request: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = request.nextUrl.searchParams.get('org_id')
  if (!orgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

  // Check agency admin
  const { data: membership } = await supabase
    .from('org_members')
    .select('is_agency_admin')
    .eq('user_id', user.id)
    .eq('is_agency_admin', true)
    .limit(1)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const admin = createAdminClient()

  // Fetch members, subscriptions, locations, and member-location assignments in parallel
  const [membersResult, subsResult, locsResult, memberLocsResult] = await Promise.all([
    admin
      .from('org_members')
      .select('id, user_id, role, is_agency_admin, location_access, created_at')
      .eq('org_id', orgId)
      .order('created_at'),
    supabase
      .from('notification_subscriptions')
      .select('*')
      .eq('org_id', orgId)
      .order('alert_type'),
    supabase
      .from('locations')
      .select('id, name, city, state')
      .eq('org_id', orgId)
      .eq('active', true)
      .order('name'),
    admin
      .from('org_member_locations')
      .select('org_member_id, location_id'),
  ])

  // Fetch user emails via admin auth API (PostgREST cannot join auth.users)
  const userIds = (membersResult.data || []).map((m: Record<string, unknown>) => m.user_id as string)
  const emailResults = await Promise.all(
    userIds.map(async (uid) => {
      const { data } = await admin.auth.admin.getUserById(uid)
      return [uid, data?.user?.email || null] as const
    })
  )
  const emailMap = new Map(emailResults)

  const members = (membersResult.data || []).map((m: Record<string, unknown>) => ({
    id: m.id,
    user_id: m.user_id,
    email: emailMap.get(m.user_id as string) || null,
    role: m.role,
    is_agency_admin: m.is_agency_admin,
    location_access: m.location_access,
    created_at: m.created_at,
    assigned_location_ids: (memberLocsResult.data || [])
      .filter((ml: Record<string, unknown>) => ml.org_member_id === m.id)
      .map((ml: Record<string, unknown>) => ml.location_id),
  }))

  return NextResponse.json({
    members,
    subscriptions: subsResult.data || [],
    locations: locsResult.data || [],
  })
}
