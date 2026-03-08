import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 120

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const apiKey = process.env.CRON_SECRET

  if (apiKey && authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminClient = createAdminClient()

  // Get all resolved recommendations (applied or rejected) from the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: recs } = await adminClient
    .from('profile_recommendations')
    .select('id, location_id, field, status, edited_value, proposed_value, created_at, applied_at')
    .in('status', ['applied', 'rejected'])
    .gte('created_at', thirtyDaysAgo)

  if (!recs || recs.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  // Compute stats by field
  const fieldStats: Record<string, {
    total: number
    applied: number
    rejected: number
    edited: number
    acceptance_rate: number
    edit_rate: number
  }> = {}

  for (const rec of recs) {
    if (!fieldStats[rec.field]) {
      fieldStats[rec.field] = { total: 0, applied: 0, rejected: 0, edited: 0, acceptance_rate: 0, edit_rate: 0 }
    }
    const stats = fieldStats[rec.field]
    stats.total++
    if (rec.status === 'applied') {
      stats.applied++
      if (rec.edited_value !== null && rec.edited_value !== undefined) {
        stats.edited++
      }
    } else if (rec.status === 'rejected') {
      stats.rejected++
    }
  }

  // Calculate rates
  for (const field of Object.keys(fieldStats)) {
    const s = fieldStats[field]
    s.acceptance_rate = s.total > 0 ? Math.round((s.applied / s.total) * 1000) / 10 : 0
    s.edit_rate = s.applied > 0 ? Math.round((s.edited / s.applied) * 1000) / 10 : 0
  }

  // Overall stats
  const overall = {
    total: recs.length,
    applied: recs.filter(r => r.status === 'applied').length,
    rejected: recs.filter(r => r.status === 'rejected').length,
    edited: recs.filter(r => r.status === 'applied' && r.edited_value !== null && r.edited_value !== undefined).length,
  }
  const overallAcceptance = overall.total > 0 ? Math.round((overall.applied / overall.total) * 1000) / 10 : 0
  const overallEditRate = overall.applied > 0 ? Math.round((overall.edited / overall.applied) * 1000) / 10 : 0

  // Log notable patterns to agent_activity_log
  for (const [field, stats] of Object.entries(fieldStats)) {
    if (stats.total < 3) continue

    const isLowAcceptance = stats.acceptance_rate < 70
    const isHighEditRate = stats.edit_rate > 50

    if (isLowAcceptance || isHighEditRate) {
      const recForField = recs.find(r => r.field === field)
      if (recForField) {
        await adminClient.from('agent_activity_log').insert({
          location_id: recForField.location_id,
          action_type: 'recommendation_effectiveness',
          status: 'completed',
          summary: `${field} recommendations: ${stats.acceptance_rate}% accepted, ${stats.edit_rate}% edited${isLowAcceptance ? ' (low acceptance)' : ''}${isHighEditRate ? ' (high edit rate)' : ''}`,
          details: { field, ...stats, period: '30d' },
        })
      }
    }
  }

  return NextResponse.json({
    period: '30d',
    overall: {
      ...overall,
      acceptance_rate: overallAcceptance,
      edit_rate: overallEditRate,
    },
    by_field: fieldStats,
  })
}
