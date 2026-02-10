import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/notifications/subscriptions?org_id=X
 * Returns all notification subscriptions for an org.
 * Agency admin: sees all. Regular user: sees what applies to them.
 */
export async function GET(request: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = request.nextUrl.searchParams.get('org_id')
  if (!orgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

  const { data: subscriptions, error } = await supabase
    .from('notification_subscriptions')
    .select('*, locations(name)')
    .eq('org_id', orgId)
    .order('alert_type')
    .order('location_id', { nullsFirst: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Resolve display names for subscribers
  const admin = createAdminClient()
  const userIds = (subscriptions || [])
    .filter(s => s.subscriber_type === 'user' && s.subscriber_value)
    .map(s => s.subscriber_value!)

  let userEmailMap = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: users } = await admin
      .from('org_members')
      .select('user_id, users:user_id(email)')
      .eq('org_id', orgId)
      .in('user_id', userIds)

    if (users) {
      for (const u of users) {
        const email = (u.users as any)?.email
        if (email) userEmailMap.set(u.user_id, email)
      }
    }
  }

  const mapped = (subscriptions || []).map((s: Record<string, unknown>) => ({
    ...s,
    location_name: (s.locations as { name: string } | null)?.name ?? null,
    locations: undefined,
    subscriber_display:
      s.subscriber_type === 'all_members' ? 'All org members' :
      s.subscriber_type === 'email' ? s.subscriber_value :
      s.subscriber_type === 'user' ? userEmailMap.get(s.subscriber_value as string) || s.subscriber_value :
      null,
  }))

  return NextResponse.json({ subscriptions: mapped })
}

/**
 * POST /api/notifications/subscriptions
 * Add a notification subscription. Agency admin only.
 *
 * Body: {
 *   org_id: string,
 *   location_id?: string | null,  // null = all locations
 *   alert_type: string,
 *   subscriber_type: 'all_members' | 'user' | 'email',
 *   subscriber_value?: string | null,
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
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const body = await request.json()
  const { org_id, location_id, alert_type, subscriber_type, subscriber_value } = body

  if (!org_id || !alert_type || !subscriber_type) {
    return NextResponse.json({ error: 'org_id, alert_type, and subscriber_type required' }, { status: 400 })
  }

  if (subscriber_type === 'email' && !subscriber_value) {
    return NextResponse.json({ error: 'subscriber_value required for email type' }, { status: 400 })
  }
  if (subscriber_type === 'user' && !subscriber_value) {
    return NextResponse.json({ error: 'subscriber_value required for user type' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('notification_subscriptions')
    .upsert({
      org_id,
      location_id: location_id || null,
      alert_type,
      subscriber_type,
      subscriber_value: subscriber_type === 'all_members' ? null : subscriber_value,
    }, {
      onConflict: 'org_id,location_id,alert_type,subscriber_type,subscriber_value',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ subscription: data })
}

/**
 * DELETE /api/notifications/subscriptions
 * Remove a notification subscription. Agency admin only.
 * Body: { id: string }
 */
export async function DELETE(request: NextRequest) {
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
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const body = await request.json()
  const { id } = body

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('notification_subscriptions')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
