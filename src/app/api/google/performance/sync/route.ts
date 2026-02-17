import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchPerformanceMetrics } from '@/lib/google/performance'
import { getValidAccessToken, GoogleAuthError } from '@/lib/google/auth'

export const maxDuration = 120

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
  const apiKey = process.env.CRON_SECRET

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

  // Get ALL GBP location mappings linked to a location, then pick the 10
  // least-recently-synced so every location rotates through over multiple runs.
  const { data: allMappings } = await supabase
    .from('agency_integration_mappings')
    .select('id, external_resource_id, location_id, external_resource_name, metadata')
    .eq('resource_type', 'gbp_location')
    .not('location_id', 'is', null)

  // Sort by last_performance_sync_at (nulls first = never synced), take first 10
  const mappings = (allMappings || [])
    .sort((a, b) => {
      const aTime = (a.metadata as any)?.last_performance_sync_at || ''
      const bTime = (b.metadata as any)?.last_performance_sync_at || ''
      return aTime.localeCompare(bTime)
    })
    .slice(0, 10)

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
        console.warn(
          `[performance/sync] No metrics returned for ${mapping.external_resource_name || mapping.external_resource_id}`,
          `(location_id: ${mapping.location_id}, range: ${startStr} to ${endStr})`
        )
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

        // Update mapping metadata so this location rotates to the back of the queue
        const existingMeta = (mapping.metadata as Record<string, unknown>) || {}
        await supabase
          .from('agency_integration_mappings')
          .update({ metadata: { ...existingMeta, last_performance_sync_at: new Date().toISOString() } })
          .eq('id', mapping.id)
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

// Vercel cron sends GET — delegate to the same handler
export const GET = POST
