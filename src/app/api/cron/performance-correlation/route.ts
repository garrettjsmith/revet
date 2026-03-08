import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCronSecret } from '@/lib/cron-auth'

export const maxDuration = 120

/**
 * GET/POST /api/cron/performance-correlation
 *
 * Weekly cron. Correlates profile recommendation changes (applied 14-30 days ago)
 * with subsequent GBP performance metric shifts. Logs significant changes
 * (>=10% delta) to agent_activity_log.
 */
export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request)
  if (authError) return authError

  const adminClient = createAdminClient()

  // Find recommendations applied 14-30 days ago (enough time for metrics to change)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: appliedRecs } = await adminClient
    .from('profile_recommendations')
    .select('id, location_id, field, applied_at, batch_id')
    .eq('status', 'applied')
    .gte('applied_at', thirtyDaysAgo)
    .lte('applied_at', fourteenDaysAgo)

  if (!appliedRecs || appliedRecs.length === 0) {
    return NextResponse.json({ processed: 0, correlations: 0 })
  }

  // Group by location
  const byLocation = new Map<string, typeof appliedRecs>()
  for (const rec of appliedRecs) {
    const existing = byLocation.get(rec.location_id) || []
    existing.push(rec)
    byLocation.set(rec.location_id, existing)
  }

  const correlations: Array<{
    location_id: string
    field: string
    applied_at: string
    changes: Record<string, { before: number; after: number; change_pct: number }>
  }> = []

  for (const [locationId, recs] of Array.from(byLocation)) {
    for (const rec of recs) {
      const appliedDate = new Date(rec.applied_at!)

      // Get 7 days of metrics BEFORE the change
      const beforeStart = new Date(appliedDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const beforeEnd = new Date(appliedDate.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      // Get 7 days of metrics AFTER the change (starting 7 days after to allow settling)
      const afterStart = new Date(appliedDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const afterEnd = new Date(appliedDate.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      const [{ data: beforeMetrics }, { data: afterMetrics }] = await Promise.all([
        adminClient
          .from('gbp_performance_metrics')
          .select('metric, value')
          .eq('location_id', locationId)
          .gte('date', beforeStart)
          .lte('date', beforeEnd),
        adminClient
          .from('gbp_performance_metrics')
          .select('metric, value')
          .eq('location_id', locationId)
          .gte('date', afterStart)
          .lte('date', afterEnd),
      ])

      if (!beforeMetrics?.length || !afterMetrics?.length) continue

      // Average metrics by type
      const avgBefore: Record<string, number> = {}
      const avgAfter: Record<string, number> = {}
      const countBefore: Record<string, number> = {}
      const countAfter: Record<string, number> = {}

      for (const m of beforeMetrics) {
        avgBefore[m.metric] = (avgBefore[m.metric] || 0) + Number(m.value)
        countBefore[m.metric] = (countBefore[m.metric] || 0) + 1
      }
      for (const m of afterMetrics) {
        avgAfter[m.metric] = (avgAfter[m.metric] || 0) + Number(m.value)
        countAfter[m.metric] = (countAfter[m.metric] || 0) + 1
      }

      for (const key of Object.keys(avgBefore)) {
        avgBefore[key] = avgBefore[key] / (countBefore[key] || 1)
      }
      for (const key of Object.keys(avgAfter)) {
        avgAfter[key] = avgAfter[key] / (countAfter[key] || 1)
      }

      // Calculate changes
      const changes: Record<string, { before: number; after: number; change_pct: number }> = {}
      const allMetrics = Array.from(new Set([...Object.keys(avgBefore), ...Object.keys(avgAfter)]))

      for (const metric of allMetrics) {
        const before = avgBefore[metric] || 0
        const after = avgAfter[metric] || 0
        if (before === 0 && after === 0) continue
        const changePct = before > 0 ? ((after - before) / before) * 100 : after > 0 ? 100 : 0
        changes[metric] = {
          before: Math.round(before * 10) / 10,
          after: Math.round(after * 10) / 10,
          change_pct: Math.round(changePct * 10) / 10,
        }
      }

      if (Object.keys(changes).length > 0) {
        correlations.push({
          location_id: locationId,
          field: rec.field,
          applied_at: rec.applied_at!,
          changes,
        })
      }
    }
  }

  // Log significant correlations to agent_activity_log
  for (const c of correlations) {
    const significantChanges = Object.entries(c.changes)
      .filter(([, v]) => Math.abs(v.change_pct) >= 10)
      .map(([k, v]) => `${k}: ${v.change_pct > 0 ? '+' : ''}${v.change_pct}%`)

    if (significantChanges.length > 0) {
      await adminClient.from('agent_activity_log').insert({
        location_id: c.location_id,
        action_type: 'performance_correlation',
        status: 'completed',
        summary: `After ${c.field} update: ${significantChanges.join(', ')}`,
        details: { field: c.field, applied_at: c.applied_at, changes: c.changes },
      })
    }
  }

  return NextResponse.json({
    processed: appliedRecs.length,
    correlations: correlations.length,
    significant: correlations.filter(c =>
      Object.values(c.changes).some(v => Math.abs(v.change_pct) >= 10)
    ).length,
  })
}

// Vercel cron sends GET
export const GET = POST
