import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { checkAgencyAdmin } from '@/lib/locations'
import {
  getLocationPhases,
  advancePipeline,
  initializeAndBackfill,
  completePhase,
  failPhase,
  startPhase,
  type SetupPhase,
} from '@/lib/pipeline'

/**
 * GET /api/locations/[locationId]/pipeline
 *
 * Returns the current pipeline state for a location.
 * Initializes + backfills if no phases exist yet.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const locationId = params.locationId
  let phases = await getLocationPhases(locationId)

  if (phases.length === 0) {
    phases = await initializeAndBackfill(locationId)
  }

  return NextResponse.json({ phases })
}

/**
 * POST /api/locations/[locationId]/pipeline
 *
 * Advance the pipeline — check prerequisites and trigger ready phases.
 * Also supports manual phase updates via body.
 *
 * Body (optional):
 *   { action: 'advance' }                    — auto-advance all ready phases
 *   { action: 'complete', phase: 'intake' }  — manually mark a phase complete
 *   { action: 'skip', phase: 'citations' }   — skip a phase
 *   { action: 'retry', phase: 'audit' }      — retry a failed phase
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  // Accept agency admin session or CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const apiKey = process.env.CRON_SECRET
  const isCronAuth = apiKey && authHeader === `Bearer ${apiKey}`

  if (!isCronAuth) {
    const isAdmin = await checkAgencyAdmin()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
    }
  }

  const locationId = params.locationId
  const body = await request.json().catch(() => ({}))
  const action = body.action || 'advance'
  const phase = body.phase as SetupPhase | undefined

  switch (action) {
    case 'advance': {
      const result = await advancePipeline(locationId)
      const phases = await getLocationPhases(locationId)
      return NextResponse.json({ triggered: result.triggered, blocking: result.blocking, phases })
    }

    case 'complete': {
      if (!phase) return NextResponse.json({ error: 'phase required' }, { status: 400 })
      await completePhase(locationId, phase, body.metadata)
      // Auto-advance after completing a phase
      const advResult = await advancePipeline(locationId)
      const phases = await getLocationPhases(locationId)
      return NextResponse.json({ triggered: advResult.triggered, phases })
    }

    case 'skip': {
      if (!phase) return NextResponse.json({ error: 'phase required' }, { status: 400 })
      const adminClient = (await import('@/lib/supabase/admin')).createAdminClient()
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
      const advResult = await advancePipeline(locationId)
      const phases = await getLocationPhases(locationId)
      return NextResponse.json({ triggered: advResult.triggered, phases })
    }

    case 'retry': {
      if (!phase) return NextResponse.json({ error: 'phase required' }, { status: 400 })
      await startPhase(locationId, phase)
      // Re-trigger by resetting to pending then advancing
      const adminClient = (await import('@/lib/supabase/admin')).createAdminClient()
      await adminClient
        .from('location_setup_phases')
        .update({ status: 'pending', error: null, started_at: null })
        .eq('location_id', locationId)
        .eq('phase', phase)
      const advResult = await advancePipeline(locationId)
      const phases = await getLocationPhases(locationId)
      return NextResponse.json({ triggered: advResult.triggered, phases })
    }

    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }
}
