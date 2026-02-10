import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/notifications/preferences/initialize
 * Agency admin initializes notification preferences for a user.
 * Creates default preference rows for all alert types at the specified locations.
 *
 * Body: {
 *   org_id: string,
 *   user_id: string,
 *   location_ids: string[],
 *   email_enabled?: boolean   // default: true
 * }
 */
export async function POST(request: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check agency admin
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
  const { org_id, user_id, location_ids, email_enabled = true } = body

  if (!org_id || !user_id || !Array.isArray(location_ids) || location_ids.length === 0) {
    return NextResponse.json({ error: 'org_id, user_id, and location_ids required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.rpc('initialize_notification_preferences', {
    p_org_id: org_id,
    p_user_id: user_id,
    p_location_ids: location_ids,
    p_email_enabled: email_enabled,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
