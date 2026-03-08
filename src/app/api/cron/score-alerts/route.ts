import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, buildScoreDropAlertEmail } from '@/lib/email'
import { verifyCronSecret } from '@/lib/cron-auth'

export const maxDuration = 120

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request)
  if (authError) return authError

  const adminClient = createAdminClient()

  // Get all active locations with their org info
  const { data: locations } = await adminClient
    .from('locations')
    .select('id, name, org_id, organizations(name, slug)')
    .eq('active', true)

  if (!locations || locations.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  const alerts: Array<{
    locationId: string
    locationName: string
    orgId: string
    previousScore: number
    currentScore: number
    drop: number
  }> = []

  // Batch fetch all audit_history records for active locations
  const locationIds = locations.map((l) => l.id)
  const { data: allAudits } = await adminClient
    .from('audit_history')
    .select('location_id, score, created_at')
    .in('location_id', locationIds)
    .order('created_at', { ascending: false })

  // Group by location_id, keeping only the 2 most recent per location
  const auditsByLocation = new Map<string, Array<{ score: number; created_at: string }>>()
  if (allAudits) {
    for (const audit of allAudits) {
      const existing = auditsByLocation.get(audit.location_id)
      if (!existing) {
        auditsByLocation.set(audit.location_id, [audit])
      } else if (existing.length < 2) {
        existing.push(audit)
      }
    }
  }

  for (const loc of locations) {
    const audits = auditsByLocation.get(loc.id)
    if (!audits || audits.length < 2) continue

    const current = audits[0].score
    const previous = audits[1].score
    const drop = previous - current

    // Alert if score dropped by 10+ points OR dropped below 60
    if (drop >= 10 || (current < 60 && previous >= 60)) {
      alerts.push({
        locationId: loc.id,
        locationName: loc.name,
        orgId: loc.org_id,
        previousScore: previous,
        currentScore: current,
        drop,
      })
    }
  }

  // Group alerts by org and send emails to agency admins
  const byOrg = new Map<string, typeof alerts>()
  for (const alert of alerts) {
    const existing = byOrg.get(alert.orgId) || []
    existing.push(alert)
    byOrg.set(alert.orgId, existing)
  }

  let emailsSent = 0
  const orgEntries = Array.from(byOrg.entries())
  for (const [orgId, orgAlerts] of orgEntries) {
    // Get agency admin emails for this org
    const { data: admins } = await adminClient
      .from('org_members')
      .select('user_id, users:user_id(email)')
      .eq('org_id', orgId)
      .eq('is_agency_admin', true)

    const emails = (admins || [])
      .map((a: any) => a.users?.email)
      .filter(Boolean) as string[]

    if (emails.length === 0) continue

    const org = locations.find((l) => l.org_id === orgId)
    const orgName = (org as any)?.organizations?.name || 'Unknown Org'

    const html = buildScoreDropAlertEmail({
      orgName,
      alerts: orgAlerts.map((a) => ({
        locationName: a.locationName,
        previousScore: a.previousScore,
        currentScore: a.currentScore,
        drop: a.drop,
      })),
    })

    await sendEmail({
      to: emails,
      subject: `Profile score alert — ${orgAlerts.length} location${orgAlerts.length > 1 ? 's' : ''} dropped`,
      html,
    })
    emailsSent++
  }

  // Log alerts to agent_activity_log (deduplicate by location + action_type + date)
  const today = new Date().toISOString().split('T')[0]
  for (const alert of alerts) {
    const { count } = await adminClient
      .from('agent_activity_log')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', alert.locationId)
      .eq('action_type', 'score_drop_alert')
      .gte('created_at', today)

    if ((count || 0) > 0) continue

    await adminClient.from('agent_activity_log').insert({
      location_id: alert.locationId,
      action_type: 'score_drop_alert',
      status: 'completed',
      summary: `Profile score dropped from ${alert.previousScore} to ${alert.currentScore} (-${alert.drop})`,
      details: {
        previous_score: alert.previousScore,
        current_score: alert.currentScore,
        drop: alert.drop,
      },
    })
  }

  return NextResponse.json({
    processed: locations.length,
    alerts: alerts.length,
    emails_sent: emailsSent,
  })
}
