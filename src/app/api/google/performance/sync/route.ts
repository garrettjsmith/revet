import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchPerformanceMetrics } from '@/lib/google/performance'
import { getValidAccessToken, GoogleAuthError } from '@/lib/google/auth'

/**
 * POST /api/google/performance/sync
 *
 * Daily cron endpoint that syncs GBP performance metrics for all mapped locations.
 * Processes up to 10 locations per run.
 *
 * Body (optional): {
 *   date_range?: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }
 * }
 * Defaults to last 7 days if not specified.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const apiKey = process.env.REVIEW_SYNC_API_KEY

  if (apiKey && authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await getValidAccessToken()
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      return NextResponse.json(
        { error: 'Google integration requires reconnection' },
        { status: 401 }
      )
    }
    return NextResponse.json({ error: 'Google auth error' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const supabase = createAdminClient()

  // Default to last 7 days
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 7)

  const startStr = body.date_range?.start || startDate.toISOString().split('T')[0]
  const endStr = body.date_range?.end || endDate.toISOString().split('T')[0]

  // Get GBP location mappings (up to 10 per run)
  const { data: mappings } = await supabase
    .from('agency_integration_mappings')
    .select('external_resource_id, location_id, external_resource_name')
    .eq('resource_type', 'gbp_location')
    .limit(10)

  if (!mappings || mappings.length === 0) {
    return NextResponse.json({ ok: true, message: 'No GBP locations mapped', synced: 0 })
  }

  const results: Array<{ location_id: string; metrics_synced: number; error?: string }> = []

  for (const mapping of mappings) {
    try {
      // The performance API uses just "locations/ID" not the full accounts path
      // Extract from the mapping's external_resource_id
      const locationName = mapping.external_resource_id

      const metrics = await fetchPerformanceMetrics(locationName, startStr, endStr)

      if (metrics.length === 0) {
        results.push({ location_id: mapping.location_id!, metrics_synced: 0 })
        continue
      }

      // Upsert metrics
      const rows = metrics.map((m) => ({
        location_id: mapping.location_id!,
        date: m.date,
        metric: m.metric,
        value: m.value,
      }))

      const { error: upsertError } = await supabase
        .from('gbp_performance_metrics')
        .upsert(rows, { onConflict: 'location_id,date,metric' })

      if (upsertError) {
        console.error(`[performance/sync] Upsert error for ${mapping.location_id}:`, upsertError)
        results.push({ location_id: mapping.location_id!, metrics_synced: 0, error: upsertError.message })
      } else {
        results.push({ location_id: mapping.location_id!, metrics_synced: rows.length })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[performance/sync] Error for ${mapping.location_id}:`, errorMessage)
      results.push({ location_id: mapping.location_id!, metrics_synced: 0, error: errorMessage })
    }
  }

  const totalSynced = results.reduce((sum, r) => sum + r.metrics_synced, 0)

  return NextResponse.json({
    ok: true,
    locations_processed: results.length,
    total_metrics_synced: totalSynced,
    date_range: { start: startStr, end: endStr },
    results,
  })
}
