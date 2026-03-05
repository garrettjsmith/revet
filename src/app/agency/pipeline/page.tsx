import { createAdminClient } from '@/lib/supabase/admin'
import { requireAgencyAdmin } from '@/lib/locations'
import { calculateProgress, PHASE_ORDER, PHASE_LABELS, type PhaseRecord } from '@/lib/pipeline'
import { PipelineTable } from '@/components/pipeline-table'

export const dynamic = 'force-dynamic'

export default async function AgencyPipelinePage() {
  await requireAgencyAdmin()
  const adminClient = createAdminClient()

  const [
    { data: locations },
    { data: orgs },
    { data: allPhases },
  ] = await Promise.all([
    adminClient
      .from('locations')
      .select('id, name, city, state, org_id, status, setup_status')
      .neq('status', 'archived')
      .order('name'),
    adminClient
      .from('organizations')
      .select('id, name, slug')
      .order('name'),
    adminClient
      .from('location_setup_phases')
      .select('location_id, phase, status, completed_at, error'),
  ])

  const orgMap = new Map((orgs || []).map((o: any) => [o.id, o as { id: string; name: string; slug: string }]))

  // Group phases by location
  const phasesByLocation = new Map<string, PhaseRecord[]>()
  for (const phase of (allPhases || []) as PhaseRecord[]) {
    const existing = phasesByLocation.get(phase.location_id) || []
    existing.push(phase)
    phasesByLocation.set(phase.location_id, existing)
  }

  // Build rows
  const rows = (locations || []).map((loc: any) => {
    const org = orgMap.get(loc.org_id)
    const phases = phasesByLocation.get(loc.id) || []
    const progress = calculateProgress(phases)
    const statusMap = new Map(phases.map((p) => [p.phase, p.status]))

    // Find the current phase (first non-completed/skipped)
    const currentPhase = PHASE_ORDER.find((p) => {
      const s = statusMap.get(p)
      return s !== 'completed' && s !== 'skipped'
    }) || null

    // Count blocked (failed) phases
    const failedCount = phases.filter((p) => p.status === 'failed').length

    return {
      id: loc.id,
      name: loc.name,
      city: loc.city,
      state: loc.state,
      orgName: org?.name || 'Unknown',
      orgSlug: org?.slug || '',
      progress,
      currentPhase,
      currentPhaseStatus: currentPhase ? (statusMap.get(currentPhase) || 'pending') : null,
      failedCount,
      setupStatus: loc.setup_status,
      hasPhases: phases.length > 0,
    }
  })

  // Summary stats
  const total = rows.length
  const fullySetUp = rows.filter((r) => r.progress === 100).length
  const inProgress = rows.filter((r) => r.progress > 0 && r.progress < 100).length
  const notStarted = rows.filter((r) => r.progress === 0 || !r.hasPhases).length
  const blocked = rows.filter((r) => r.failedCount > 0).length

  return (
    <div className="p-8">
      <h1 className="text-2xl font-serif text-ink mb-6">Setup Pipeline</h1>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Total</div>
          <div className="text-2xl font-bold font-mono text-cream">{total}</div>
        </div>
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-emerald-400 uppercase tracking-wider mb-1">Complete</div>
          <div className="text-2xl font-bold font-mono text-cream">{fullySetUp}</div>
        </div>
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-amber-400 uppercase tracking-wider mb-1">In Progress</div>
          <div className="text-2xl font-bold font-mono text-cream">{inProgress}</div>
        </div>
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-red-400 uppercase tracking-wider mb-1">
            {blocked > 0 ? 'Blocked' : 'Not Started'}
          </div>
          <div className="text-2xl font-bold font-mono text-cream">{blocked > 0 ? blocked : notStarted}</div>
        </div>
      </div>

      <PipelineTable rows={rows} />
    </div>
  )
}
