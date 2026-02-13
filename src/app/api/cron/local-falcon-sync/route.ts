import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listScanReports, getScanReport, formatScanForDb } from '@/lib/local-falcon'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * GET /api/cron/local-falcon-sync
 *
 * Pulls latest scan reports from LocalFalcon's Data Retrieval API
 * and stores them in local_falcon_scans. Matches scans to locations
 * via GBP place_id stored in agency_integration_mappings.
 *
 * Runs daily — only imports scans not already stored (by report_key).
 */
export async function GET(request: NextRequest) {
  if (!process.env.LOCALFALCON_API_KEY) {
    return NextResponse.json({ ok: true, message: 'LOCALFALCON_API_KEY not configured', synced: 0 })
  }

  const adminClient = createAdminClient()

  // Get all GBP location mappings to match place_ids to location_ids
  const { data: mappings } = await adminClient
    .from('agency_integration_mappings')
    .select('external_resource_id, location_id, metadata')
    .eq('resource_type', 'gbp_location')

  if (!mappings || mappings.length === 0) {
    return NextResponse.json({ ok: true, message: 'No GBP locations mapped', synced: 0 })
  }

  // Build a map from place_id -> location_id
  // The place_id might be in metadata.place_id or we extract from external_resource_id
  const placeIdToLocation: Record<string, string> = {}
  for (const m of mappings) {
    const placeId = m.metadata?.place_id || m.metadata?.placeId
    if (placeId && m.location_id) {
      placeIdToLocation[placeId] = m.location_id
    }
  }

  if (Object.keys(placeIdToLocation).length === 0) {
    return NextResponse.json({ ok: true, message: 'No locations with place_ids', synced: 0 })
  }

  // Get existing report_keys so we skip already-imported scans
  const { data: existing } = await adminClient
    .from('local_falcon_scans')
    .select('report_key')

  const existingKeys = new Set((existing || []).map((r) => r.report_key))

  let synced = 0
  const errors: string[] = []

  // For each place_id, list scan reports and import new ones
  for (const [placeId, locationId] of Object.entries(placeIdToLocation)) {
    try {
      const reports = await listScanReports(placeId)

      for (const report of reports) {
        if (existingKeys.has(report.report_key)) continue

        try {
          const fullReport = await getScanReport(report.report_key)
          const row = formatScanForDb(fullReport, locationId)

          const { error } = await adminClient
            .from('local_falcon_scans')
            .upsert(row, { onConflict: 'location_id,report_key' })

          if (error) {
            errors.push(`Upsert ${report.report_key}: ${error.message}`)
          } else {
            synced++
            existingKeys.add(report.report_key)
          }
        } catch (err) {
          errors.push(`Report ${report.report_key}: ${err instanceof Error ? err.message : 'Unknown'}`)
        }
      }
    } catch (err) {
      errors.push(`Place ${placeId}: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }

  return NextResponse.json({
    ok: true,
    synced,
    errors: errors.length > 0 ? errors : undefined,
  })
}
