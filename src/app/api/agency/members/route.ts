import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agency/members
 *
 * Returns a lightweight list of all agency admin members (id, email)
 * for use in assignment dropdowns. Agency admin only.
 */
export async function GET() {
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

  const adminClient = createAdminClient()

  // Get all agency admins
  const { data: agencyMembers } = await adminClient
    .from('org_members')
    .select('user_id')
    .eq('is_agency_admin', true)

  if (!agencyMembers || agencyMembers.length === 0) {
    return NextResponse.json({ members: [] })
  }

  // Dedupe user IDs
  const userIds = Array.from(new Set(agencyMembers.map((m) => m.user_id)))

  // Fetch emails via admin auth
  const members = await Promise.all(
    userIds.map(async (uid) => {
      const { data } = await adminClient.auth.admin.getUserById(uid)
      return {
        id: uid,
        email: data?.user?.email || null,
      }
    })
  )

  return NextResponse.json({
    members: members.filter((m) => m.email),
  })
}
