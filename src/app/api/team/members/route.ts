import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/team/members
 * Add a member to an org by email. If the user doesn't exist, invite them via Supabase.
 * Agency admin only.
 */
export async function POST(request: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Agency admin check
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

  const body = await request.json()
  const { org_id, email, role } = body as {
    org_id: string
    email: string
    role: 'owner' | 'admin' | 'member'
  }

  if (!org_id || !email || !role) {
    return NextResponse.json({ error: 'org_id, email, and role are required' }, { status: 400 })
  }

  if (!['owner', 'admin', 'member'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Look up existing user by email via admin auth API
  const { data: { users }, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listError) {
    return NextResponse.json({ error: 'Failed to look up users' }, { status: 500 })
  }

  let targetUserId: string
  const existingUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase())

  if (existingUser) {
    targetUserId = existingUser.id
  } else {
    // Invite new user — Supabase sends them a confirmation email
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email)
    if (inviteError || !invited.user) {
      return NextResponse.json(
        { error: inviteError?.message || 'Failed to invite user' },
        { status: 500 }
      )
    }
    targetUserId = invited.user.id
  }

  // Check if already a member of this org
  const { data: existing } = await admin
    .from('org_members')
    .select('id')
    .eq('org_id', org_id)
    .eq('user_id', targetUserId)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'User is already a member of this organization' }, { status: 409 })
  }

  // Insert org_members row
  const { data: member, error: insertError } = await admin
    .from('org_members')
    .insert({
      org_id,
      user_id: targetUserId,
      role,
      location_access: 'all',
    })
    .select('id, user_id, role, is_agency_admin, location_access, created_at')
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({
    member: { ...member, email, assigned_location_ids: [] },
    invited: !existingUser,
  })
}
