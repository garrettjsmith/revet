import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/notifications/subscriptions/bulk
 * Returns notification subscription summary for ALL orgs (agency admin only).
 * Used by the agency-level bulk notifications page.
 */
export async function GET() {
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

  const admin = createAdminClient()

  // Fetch all orgs and their subscription counts
  const [orgsResult, subsResult, locationCountsResult] = await Promise.all([
    admin
      .from('organizations')
      .select('id, name, slug')
      .eq('status', 'active')
      .order('name'),
    admin
      .from('notification_subscriptions')
      .select('org_id, alert_type, subscriber_type, location_id'),
    admin
      .from('locations')
      .select('org_id')
      .eq('active', true),
  ])

  if (orgsResult.error) {
    return NextResponse.json({ error: orgsResult.error.message }, { status: 500 })
  }

  // Build location count per org
  const locationCounts = new Map<string, number>()
  for (const loc of (locationCountsResult.data || [])) {
    locationCounts.set(loc.org_id, (locationCounts.get(loc.org_id) || 0) + 1)
  }

  // Build subscriber counts per org per alert type
  const orgAlertCounts = new Map<string, Record<string, number>>()
  for (const sub of (subsResult.data || [])) {
    if (!orgAlertCounts.has(sub.org_id)) orgAlertCounts.set(sub.org_id, {})
    const counts = orgAlertCounts.get(sub.org_id)!
    counts[sub.alert_type] = (counts[sub.alert_type] || 0) + 1
  }

  const orgs = (orgsResult.data || []).map(org => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    locationCount: locationCounts.get(org.id) || 0,
    configuredAlerts: Object.keys(orgAlertCounts.get(org.id) || {}),
    alertCounts: orgAlertCounts.get(org.id) || {},
  }))

  return NextResponse.json({ orgs })
}

/**
 * POST /api/notifications/subscriptions/bulk
 * Bulk-create notification subscriptions across multiple orgs. Agency admin only.
 *
 * Body: {
 *   org_ids: string[],
 *   alert_types: string[],
 *   subscriber_type: 'all_members' | 'email',
 *   subscriber_value?: string,  // required for 'email' type
 * }
 *
 * Creates one subscription per org x alert_type combination with location_id=null (org-wide).
 * Uses upsert so duplicates are harmlessly ignored.
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
  const { org_ids, alert_types, subscriber_type, subscriber_value } = body

  if (!Array.isArray(org_ids) || org_ids.length === 0) {
    return NextResponse.json({ error: 'org_ids required (array)' }, { status: 400 })
  }
  if (!Array.isArray(alert_types) || alert_types.length === 0) {
    return NextResponse.json({ error: 'alert_types required (array)' }, { status: 400 })
  }
  if (!subscriber_type || !['all_members', 'email'].includes(subscriber_type)) {
    return NextResponse.json({ error: 'subscriber_type must be all_members or email' }, { status: 400 })
  }
  if (subscriber_type === 'email' && (!subscriber_value || !subscriber_value.includes('@'))) {
    return NextResponse.json({ error: 'Valid email required for email subscriber type' }, { status: 400 })
  }

  const validAlertTypes = ['new_review', 'negative_review', 'review_response', 'report']
  const filteredAlerts = alert_types.filter((t: string) => validAlertTypes.includes(t))
  if (filteredAlerts.length === 0) {
    return NextResponse.json({ error: 'No valid alert_types provided' }, { status: 400 })
  }

  // Build rows for bulk insert
  const rows = org_ids.flatMap((orgId: string) =>
    filteredAlerts.map((alertType: string) => ({
      org_id: orgId,
      location_id: null,
      alert_type: alertType,
      subscriber_type,
      subscriber_value: subscriber_type === 'all_members' ? null : subscriber_value,
    }))
  )

  // Use admin client for bulk insert to bypass per-row RLS overhead
  const admin = createAdminClient()
  const { error } = await admin
    .from('notification_subscriptions')
    .upsert(rows, {
      onConflict: 'org_id,location_id,alert_type,subscriber_type,subscriber_value',
      ignoreDuplicates: true,
    })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, created: rows.length })
}

/**
 * DELETE /api/notifications/subscriptions/bulk
 * Bulk-remove notification subscriptions across multiple orgs. Agency admin only.
 *
 * Body: {
 *   org_ids: string[],
 *   alert_types: string[],
 *   subscriber_type: 'all_members' | 'email',
 *   subscriber_value?: string,
 * }
 *
 * Removes org-wide (location_id IS NULL) subscriptions matching the criteria.
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
  const { org_ids, alert_types, subscriber_type, subscriber_value } = body

  if (!Array.isArray(org_ids) || org_ids.length === 0) {
    return NextResponse.json({ error: 'org_ids required' }, { status: 400 })
  }
  if (!Array.isArray(alert_types) || alert_types.length === 0) {
    return NextResponse.json({ error: 'alert_types required' }, { status: 400 })
  }

  const admin = createAdminClient()

  let query = admin
    .from('notification_subscriptions')
    .delete()
    .in('org_id', org_ids)
    .in('alert_type', alert_types)
    .eq('subscriber_type', subscriber_type)
    .is('location_id', null)

  if (subscriber_type === 'all_members') {
    query = query.is('subscriber_value', null)
  } else if (subscriber_value) {
    query = query.eq('subscriber_value', subscriber_value)
  }

  const { error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
