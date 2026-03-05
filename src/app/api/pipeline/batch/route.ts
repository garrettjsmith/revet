import { NextRequest, NextResponse } from 'next/server'
import { checkAgencyAdmin } from '@/lib/locations'
import { advancePipeline, getLocationPhases, calculateProgress, type SetupPhase } from '@/lib/pipeline'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 120

/**
 * POST /api/pipeline/batch
 *
 * Batch pipeline operations across multiple locations.
 * Agency admin only.
 *
 * Body:
 *   { action: 'advance', location_ids: string[] }
 *   { action: 'skip', location_ids: string[], phase: SetupPhase }
 */
export async function POST(request: NextRequest) {
  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { action, location_ids, phase } = body as {
    action: string
    location_ids: string[]
    phase?: SetupPhase
  }

  if (!location_ids || !Array.isArray(location_ids) || location_ids.length === 0) {
    return NextResponse.json({ error: 'location_ids required' }, { status: 400 })
  }

  if (location_ids.length > 200) {
    return NextResponse.json({ error: 'Max 200 locations per request' }, { status: 400 })
  }

  const results: Array<{ location_id: string; status: 'ok' | 'error'; error?: string }> = []

  switch (action) {
    case 'advance': {
      for (const locationId of location_ids) {
        try {
          await advancePipeline(locationId)
          results.push({ location_id: locationId, status: 'ok' })
        } catch (err) {
          results.push({ location_id: locationId, status: 'error', error: err instanceof Error ? err.message : 'Unknown error' })
        }
        // 200ms stagger to avoid hammering downstream APIs
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
      break
    }

    case 'skip': {
      if (!phase) {
        return NextResponse.json({ error: 'phase required for skip action' }, { status: 400 })
      }

      const adminClient = createAdminClient()
      for (const locationId of location_ids) {
        try {
          await adminClient
            .from('location_setup_phases')
            .upsert(
              {
                location_id: locationId,
                phase,
                status: 'skipped',
                completed_at: new Date().toISOString(),
              },
              { onConflict: 'location_id,phase' }
            )
          // Auto-advance after skip
          await advancePipeline(locationId)
          results.push({ location_id: locationId, status: 'ok' })
        } catch (err) {
          results.push({ location_id: locationId, status: 'error', error: err instanceof Error ? err.message : 'Unknown error' })
        }
      }
      break
    }

    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const ok = results.filter((r) => r.status === 'ok').length
  const errors = results.filter((r) => r.status === 'error').length

  return NextResponse.json({
    ok: true,
    summary: { ok, errors, total: results.length },
    results,
  })
}
