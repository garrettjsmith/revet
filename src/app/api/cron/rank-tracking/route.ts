import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * GET /api/cron/rank-tracking
 *
 * Daily cron that compares the latest LocalFalcon scan ARP (Average Rank
 * Position) to the previous scan for each location. Stores the daily rank
 * as a gbp_performance_metrics entry and logs an alert to
 * agent_activity_log when rank drops by 3+ positions.
 */
export async function GET(request: NextRequest) {
  const apiKey = process.env.CRON_SECRET

  if (apiKey && request.headers.get('authorization') !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminClient = createAdminClient()

  // Get distinct location_ids that have LocalFalcon scan data
  const { data: locationRows } = await adminClient
    .from('local_falcon_scans')
    .select('location_id')

  if (!locationRows || locationRows.length === 0) {
    return NextResponse.json({ processed: 0, tracked: 0, alerts: 0 })
  }

  const locationIds = [...new Set(locationRows.map((r) => r.location_id))]

  let alerts = 0
  let tracked = 0

  for (const locationId of locationIds) {
    // Get last 2 scans ordered by scan date
    const { data: scans } = await adminClient
      .from('local_falcon_scans')
      .select('arp, keyword, scanned_at')
      .eq('location_id', locationId)
      .order('scanned_at', { ascending: false })
      .limit(2)

    if (!scans || scans.length < 2) continue

    const latest = scans[0]
    const previous = scans[1]

    const latestRank = Number(latest.arp)
    const previousRank = Number(previous.arp)

    if (!latestRank || !previousRank) continue

    tracked++

    // Store as performance metric (value is bigint, so round)
    const today = new Date().toISOString().split('T')[0]
    await adminClient
      .from('gbp_performance_metrics')
      .upsert(
        {
          location_id: locationId,
          date: today,
          metric: 'local_rank_avg',
          value: Math.round(latestRank),
        },
        { onConflict: 'location_id,date,metric' }
      )

    // Alert if rank dropped significantly (3+ positions worse = higher ARP)
    const rankChange = latestRank - previousRank
    if (rankChange >= 3) {
      alerts++
      await adminClient.from('agent_activity_log').insert({
        location_id: locationId,
        action_type: 'competitor_tracking',
        status: 'completed',
        summary: `Local rank dropped: ${previousRank.toFixed(1)} -> ${latestRank.toFixed(1)} (+${rankChange.toFixed(1)} positions)`,
        details: {
          previous_rank: previousRank,
          current_rank: latestRank,
          change: rankChange,
          keyword: latest.keyword || null,
        },
      })
    }
  }

  return NextResponse.json({ processed: locationIds.length, tracked, alerts })
}
