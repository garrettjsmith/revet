import { createServerSupabase } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/notifications/preferences?org_id=X
 * Returns the current user's notification preferences for all locations in the org.
 */
export async function GET(request: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = request.nextUrl.searchParams.get('org_id')
  if (!orgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

  const { data: preferences, error } = await supabase
    .from('notification_preferences')
    .select('*, locations(name)')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .order('location_id')
    .order('alert_type')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Flatten the joined location name
  const mapped = (preferences || []).map((p: Record<string, unknown>) => ({
    ...p,
    location_name: (p.locations as { name: string } | null)?.name ?? null,
    locations: undefined,
  }))

  return NextResponse.json({ preferences: mapped })
}

/**
 * PATCH /api/notifications/preferences
 * Toggle a single preference on/off.
 * Body: { id: string, email_enabled: boolean }
 */
export async function PATCH(request: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { id, email_enabled } = body

  if (!id || typeof email_enabled !== 'boolean') {
    return NextResponse.json({ error: 'id and email_enabled required' }, { status: 400 })
  }

  // RLS ensures user can only update their own rows
  const { data, error } = await supabase
    .from('notification_preferences')
    .update({ email_enabled })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ preference: data })
}
