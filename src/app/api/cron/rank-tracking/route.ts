import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCronSecret } from '@/lib/cron-auth'

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
  const authError = verifyCronSecret(request)
  if (authError) return authError

  const adminClient = createAdminClient()

  // Get distinct location_ids that have LocalFalcon scan data (scoped to last 90 days)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const { data: locationRows } = await adminClient
    .from('local_falcon_scans')
    .select('location_id, keyword')
    .gte('scanned_at', ninetyDaysAgo)
    .limit(5000)

  if (!locationRows || locationRows.length === 0) {
    return NextResponse.json({ processed: 0, tracked: 0, alerts: 0 })
  }

  // Build unique location+keyword pairs
  const pairKeys = new Set<string>()
  const pairs: Array<{ locationId: string; keyword: string }> = []
  for (const r of locationRows) {
    const key = `${r.location_id}:${r.keyword}`
    if (!pairKeys.has(key)) {
      pairKeys.add(key)
      pairs.push({ locationId: r.location_id, keyword: r.keyword })
    }
  }

  // Batch fetch all scans with arp data, ordered by scanned_at desc
  const locationIds = Array.from(new Set(pairs.map((p) => p.locationId)))
  const { data: allScans } = await adminClient
    .from('local_falcon_scans')
    .select('location_id, arp, keyword, scanned_at')
    .in('location_id', locationIds)
    .gte('scanned_at', ninetyDaysAgo)
    .order('scanned_at', { ascending: false })

  // Group by location_id+keyword, keeping only the 2 most recent per pair
  const scansByPair = new Map<string, Array<{ arp: number; keyword: string; scanned_at: string }>>()
  if (allScans) {
    for (const scan of allScans) {
      const key = `${scan.location_id}:${scan.keyword}`
      const existing = scansByPair.get(key)
      if (!existing) {
        scansByPair.set(key, [scan as any])
      } else if (existing.length < 2) {
        existing.push(scan as any)
      }
    }
  }

  let alerts = 0
  let tracked = 0
  const today = new Date().toISOString().split('T')[0]

  for (const { locationId, keyword } of pairs) {
    const key = `${locationId}:${keyword}`
    const scans = scansByPair.get(key)

    if (!scans || scans.length < 2) continue

    const latest = scans[0]
    const previous = scans[1]

    const latestRank = Number(latest.arp)
    const previousRank = Number(previous.arp)

    if (!latestRank || !previousRank) continue

    tracked++

    // Store as performance metric (value is bigint, so round)
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
      const { count: existingCount } = await adminClient
        .from('agent_activity_log')
        .select('id', { count: 'exact', head: true })
        .eq('location_id', locationId)
        .eq('action_type', 'competitor_tracking')
        .gte('created_at', today)

      if ((existingCount || 0) === 0) {
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
  }

  return NextResponse.json({ processed: pairs.length, tracked, alerts })
}
