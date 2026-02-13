import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchSearchKeywords } from '@/lib/google/performance'
import { getValidAccessToken, GoogleAuthError } from '@/lib/google/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * GET /api/cron/keyword-sync
 *
 * Monthly cron that syncs GBP search keyword impressions.
 * Fetches the previous month's keyword data from Google's
 * searchkeywords.impressions.monthly endpoint.
 *
 * Google releases keyword data at the start of each month for
 * the prior month. Data older than ~18 months disappears, so
 * regular syncing is essential.
 */
export async function GET(request: NextRequest) {
  try {
    await getValidAccessToken()
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      return NextResponse.json({ error: 'Google integration requires reconnection' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Google auth error' }, { status: 500 })
  }

  const adminClient = createAdminClient()

  // Get all GBP location mappings
  const { data: mappings } = await adminClient
    .from('agency_integration_mappings')
    .select('external_resource_id, location_id')
    .eq('resource_type', 'gbp_location')

  if (!mappings || mappings.length === 0) {
    return NextResponse.json({ ok: true, message: 'No GBP locations mapped', synced: 0 })
  }

  // Sync the previous month's data (current month data may not be ready)
  const now = new Date()
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const year = prevMonth.getFullYear()
  const month = prevMonth.getMonth() + 1

  let totalSynced = 0
  const errors: string[] = []

  for (const mapping of mappings) {
    if (!mapping.location_id) continue

    try {
      const keywords = await fetchSearchKeywords(mapping.external_resource_id, year, month)

      if (keywords.length === 0) continue

      const rows = keywords.map((k) => ({
        location_id: mapping.location_id!,
        year,
        month,
        keyword: k.keyword,
        impressions: k.impressions,
        threshold: k.threshold,
      }))

      const { error } = await adminClient
        .from('gbp_search_keywords')
        .upsert(rows, { onConflict: 'location_id,year,month,keyword' })

      if (error) {
        errors.push(`${mapping.location_id}: ${error.message}`)
      } else {
        totalSynced += rows.length
      }
    } catch (err) {
      errors.push(`${mapping.location_id}: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }

  return NextResponse.json({
    ok: true,
    period: `${year}-${String(month).padStart(2, '0')}`,
    locations_processed: mappings.length,
    keywords_synced: totalSynced,
    errors: errors.length > 0 ? errors : undefined,
  })
}
