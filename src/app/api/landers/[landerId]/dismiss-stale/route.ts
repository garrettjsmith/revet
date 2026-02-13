import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/landers/[landerId]/dismiss-stale
 *
 * Clears the ai_content_stale flag on a lander without regenerating content.
 * Agency admin only.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ landerId: string }> }
) {
  const { landerId } = await params

  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminClient = createAdminClient()

  const { data: admin } = await adminClient
    .from('org_members')
    .select('is_agency_admin')
    .eq('user_id', user.id)
    .eq('is_agency_admin', true)
    .limit(1)
    .single()

  if (!admin) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const { error } = await adminClient
    .from('local_landers')
    .update({ ai_content_stale: false })
    .eq('id', landerId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
