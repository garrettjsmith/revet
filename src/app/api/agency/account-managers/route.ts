import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agency/account-managers?org_id=X
 *
 * Returns account managers for an org (or all assignments if no org_id).
 * Agency admin only.
 */
export async function GET(request: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  const orgId = request.nextUrl.searchParams.get('org_id')

  let query = adminClient
    .from('org_account_managers')
    .select('id, org_id, user_id, created_at, organizations(name)')
    .order('created_at')

  if (orgId) {
    query = query.eq('org_id', orgId)
  }

  const { data: assignments, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Resolve emails
  const userIds = Array.from(new Set((assignments || []).map((a) => a.user_id)))
  const emailMap = new Map<string, string>()
  for (const uid of userIds) {
    const { data } = await adminClient.auth.admin.getUserById(uid)
    if (data?.user?.email) {
      emailMap.set(uid, data.user.email)
    }
  }

  const result = (assignments || []).map((a: any) => ({
    id: a.id,
    org_id: a.org_id,
    user_id: a.user_id,
    email: emailMap.get(a.user_id) || null,
    org_name: a.organizations?.name || null,
    created_at: a.created_at,
  }))

  return NextResponse.json({ assignments: result })
}

/**
 * POST /api/agency/account-managers
 *
 * Assign a team member as account manager for an org.
 * Body: { org_id: string, user_id: string }
 * Agency admin only.
 */
export async function POST(request: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  const { org_id, user_id } = body as { org_id: string; user_id: string }

  if (!org_id || !user_id) {
    return NextResponse.json({ error: 'org_id and user_id are required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from('org_account_managers')
    .insert({ org_id, user_id })
    .select('id, org_id, user_id, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Already assigned' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ assignment: data })
}

/**
 * DELETE /api/agency/account-managers
 *
 * Remove an account manager assignment.
 * Body: { id: string } or { org_id: string, user_id: string }
 * Agency admin only.
 */
export async function DELETE(request: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  const adminClient = createAdminClient()

  if (body.id) {
    const { error } = await adminClient
      .from('org_account_managers')
      .delete()
      .eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (body.org_id && body.user_id) {
    const { error } = await adminClient
      .from('org_account_managers')
      .delete()
      .eq('org_id', body.org_id)
      .eq('user_id', body.user_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    return NextResponse.json({ error: 'id or org_id+user_id required' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
