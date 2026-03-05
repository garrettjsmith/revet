import { createAdminClient } from '@/lib/supabase/admin'

export type SetupPhase =
  | 'gbp_connect'
  | 'initial_sync'
  | 'benchmark'
  | 'audit'
  | 'intake'
  | 'recommendations'
  | 'optimization'
  | 'review_setup'
  | 'citations'
  | 'lander'
  | 'notifications'
  | 'complete'

export type PhaseStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface PhaseRecord {
  id: string
  location_id: string
  phase: SetupPhase
  status: PhaseStatus
  started_at: string | null
  completed_at: string | null
  error: string | null
  metadata: Record<string, unknown>
}

/**
 * Phase ordering and prerequisites.
 * A phase can start when ALL of its prerequisites are 'completed' or 'skipped'.
 */
const PHASE_PREREQUISITES: Record<SetupPhase, SetupPhase[]> = {
  gbp_connect: [],
  initial_sync: ['gbp_connect'],
  benchmark: ['initial_sync'],
  audit: ['initial_sync'],
  intake: [], // Can happen anytime
  recommendations: ['audit', 'intake'],
  optimization: ['recommendations'],
  review_setup: ['initial_sync'],
  citations: ['initial_sync'],
  lander: ['audit', 'intake'],
  notifications: ['review_setup'],
  complete: ['optimization', 'review_setup', 'citations', 'lander', 'notifications'],
}

/** Ordered list for display purposes */
export const PHASE_ORDER: SetupPhase[] = [
  'gbp_connect',
  'initial_sync',
  'benchmark',
  'audit',
  'intake',
  'recommendations',
  'optimization',
  'review_setup',
  'citations',
  'lander',
  'notifications',
  'complete',
]

export const PHASE_LABELS: Record<SetupPhase, string> = {
  gbp_connect: 'Connect GBP',
  initial_sync: 'Sync Profile',
  benchmark: 'Benchmark Metrics',
  audit: 'Profile Audit',
  intake: 'Business Intake',
  recommendations: 'AI Recommendations',
  optimization: 'Apply Optimizations',
  review_setup: 'Review Monitoring',
  citations: 'Citation Audit',
  lander: 'Local Lander',
  notifications: 'Notifications',
  complete: 'Setup Complete',
}

export const PHASE_DESCRIPTIONS: Record<SetupPhase, string> = {
  gbp_connect: 'Link Google Business Profile to this location',
  initial_sync: 'Pull current profile data, photos, and posts from Google',
  benchmark: 'Capture initial performance metrics as a baseline',
  audit: 'Score profile completeness and identify improvement areas',
  intake: 'Collect business details, brand voice, and visual preferences',
  recommendations: 'Generate AI-powered optimization suggestions',
  optimization: 'Review and apply approved changes to the GBP profile',
  review_setup: 'Configure review monitoring and response automation',
  citations: 'Audit directory listings for NAP consistency',
  lander: 'Generate a local landing page for this location',
  notifications: 'Set up alert routing for reviews and reports',
  complete: 'All onboarding steps finished',
}

/**
 * Stage groupings for visual hierarchy.
 * Each stage groups related phases together.
 */
export type PipelineStage = 'connect' | 'audit' | 'optimize' | 'activate'

export interface StageDefinition {
  id: PipelineStage
  label: string
  phases: SetupPhase[]
}

export const PIPELINE_STAGES: StageDefinition[] = [
  {
    id: 'connect',
    label: 'Connect',
    phases: ['gbp_connect', 'initial_sync', 'benchmark'],
  },
  {
    id: 'audit',
    label: 'Audit',
    phases: ['audit', 'intake'],
  },
  {
    id: 'optimize',
    label: 'Optimize',
    phases: ['recommendations', 'optimization'],
  },
  {
    id: 'activate',
    label: 'Activate',
    phases: ['review_setup', 'citations', 'lander', 'notifications'],
  },
]

/**
 * Get stage status based on its phases.
 */
export function getStageStatus(
  stage: StageDefinition,
  statusMap: Map<SetupPhase, PhaseStatus>
): 'completed' | 'active' | 'failed' | 'pending' {
  const statuses = stage.phases.map((p) => statusMap.get(p) || 'pending')

  if (statuses.every((s) => s === 'completed' || s === 'skipped')) return 'completed'
  if (statuses.some((s) => s === 'failed')) return 'failed'
  if (statuses.some((s) => s === 'running' || s === 'completed' || s === 'skipped')) return 'active'
  return 'pending'
}

/**
 * Find the next actionable phase — the first phase that needs attention.
 * Priority: failed > running > first pending with met prerequisites.
 */
export function getNextActionPhase(phases: PhaseRecord[]): SetupPhase | null {
  const statusMap = new Map(phases.map((p) => [p.phase, p]))

  // First: any failed phase (needs retry)
  for (const phase of PHASE_ORDER) {
    if (phase === 'complete') continue
    if (statusMap.get(phase)?.status === 'failed') return phase
  }

  // Second: any running phase
  for (const phase of PHASE_ORDER) {
    if (phase === 'complete') continue
    if (statusMap.get(phase)?.status === 'running') return phase
  }

  // Third: first pending phase whose prerequisites are met (manual action needed)
  const ready = getReadyPhases(phases)
  return ready.find((p) => p !== 'complete') || null
}

/**
 * Get all setup phases for a location.
 */
export async function getLocationPhases(locationId: string): Promise<PhaseRecord[]> {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('location_setup_phases')
    .select('*')
    .eq('location_id', locationId)
    .order('created_at')

  return (data || []) as PhaseRecord[]
}

/**
 * Mark a phase as completed.
 */
export async function completePhase(
  locationId: string,
  phase: SetupPhase,
  metadata?: Record<string, unknown>
): Promise<void> {
  const adminClient = createAdminClient()
  await adminClient
    .from('location_setup_phases')
    .upsert(
      {
        location_id: locationId,
        phase,
        status: 'completed',
        completed_at: new Date().toISOString(),
        error: null,
        metadata: metadata || {},
      },
      { onConflict: 'location_id,phase' }
    )
}

/**
 * Mark a phase as running.
 */
export async function startPhase(locationId: string, phase: SetupPhase): Promise<void> {
  const adminClient = createAdminClient()
  await adminClient
    .from('location_setup_phases')
    .upsert(
      {
        location_id: locationId,
        phase,
        status: 'running',
        started_at: new Date().toISOString(),
        error: null,
      },
      { onConflict: 'location_id,phase' }
    )
}

/**
 * Mark a phase as failed.
 */
export async function failPhase(locationId: string, phase: SetupPhase, error: string): Promise<void> {
  const adminClient = createAdminClient()
  await adminClient
    .from('location_setup_phases')
    .upsert(
      {
        location_id: locationId,
        phase,
        status: 'failed',
        error,
      },
      { onConflict: 'location_id,phase' }
    )
}

/**
 * Detect which phases are already completed by checking existing data.
 * Used for backfilling pipeline state for locations that existed before the pipeline.
 */
export async function detectCompletedPhases(locationId: string): Promise<SetupPhase[]> {
  const adminClient = createAdminClient()
  const completed: SetupPhase[] = []

  const [
    { data: gbpProfile },
    { data: location },
    { count: metricsCount },
    { count: auditCount },
    { count: recsCount },
    { count: reviewSourceCount },
    { count: citationCount },
    { data: lander },
    { count: notifCount },
  ] = await Promise.all([
    adminClient.from('gbp_profiles').select('id, sync_status, last_synced_at').eq('location_id', locationId).single(),
    adminClient.from('locations').select('intake_completed_at, setup_status').eq('id', locationId).single(),
    adminClient.from('gbp_performance_metrics').select('id', { count: 'exact', head: true }).eq('location_id', locationId),
    adminClient.from('audit_history').select('id', { count: 'exact', head: true }).eq('location_id', locationId),
    adminClient.from('profile_recommendations').select('id', { count: 'exact', head: true }).eq('location_id', locationId),
    adminClient.from('review_sources').select('id', { count: 'exact', head: true }).eq('location_id', locationId).eq('sync_status', 'active'),
    adminClient.from('citation_audits').select('id', { count: 'exact', head: true }).eq('location_id', locationId).eq('status', 'completed'),
    adminClient.from('local_landers').select('id').eq('location_id', locationId).single(),
    adminClient.from('notification_subscriptions').select('id', { count: 'exact', head: true }).eq('location_id', locationId),
  ])

  if (gbpProfile) {
    completed.push('gbp_connect')
    if (gbpProfile.last_synced_at) {
      completed.push('initial_sync')
    }
  }

  if (metricsCount && metricsCount > 0) {
    completed.push('benchmark')
  }

  if (auditCount && auditCount > 0) {
    completed.push('audit')
  }

  if (location?.intake_completed_at) {
    completed.push('intake')
  }

  if (recsCount && recsCount > 0) {
    completed.push('recommendations')
  }

  if (location?.setup_status === 'optimized') {
    completed.push('optimization')
  }

  if (reviewSourceCount && reviewSourceCount > 0) {
    completed.push('review_setup')
  }

  if (citationCount && citationCount > 0) {
    completed.push('citations')
  }

  if (lander) {
    completed.push('lander')
  }

  if (notifCount && notifCount > 0) {
    completed.push('notifications')
  }

  // Check if all prerequisite phases for 'complete' are done
  const completePrereqs = PHASE_PREREQUISITES.complete
  if (completePrereqs.every((p) => completed.includes(p))) {
    completed.push('complete')
  }

  return completed
}

/**
 * Initialize and backfill pipeline phases for a location.
 * Creates all phase rows, then marks already-completed ones.
 */
export async function initializeAndBackfill(locationId: string): Promise<PhaseRecord[]> {
  const adminClient = createAdminClient()

  // Initialize all phases as pending
  await adminClient.rpc('initialize_setup_phases', { p_location_id: locationId })

  // Detect what's already done
  const completed = await detectCompletedPhases(locationId)

  // Mark completed phases
  for (const phase of completed) {
    await completePhase(locationId, phase, { backfilled: true })
  }

  return getLocationPhases(locationId)
}

/**
 * Determine which phases are ready to be triggered (prerequisites met, currently pending).
 */
export function getReadyPhases(phases: PhaseRecord[]): SetupPhase[] {
  const statusMap = new Map(phases.map((p) => [p.phase, p.status]))
  const ready: SetupPhase[] = []

  for (const [phase, prereqs] of Object.entries(PHASE_PREREQUISITES)) {
    const currentStatus = statusMap.get(phase as SetupPhase)
    if (currentStatus !== 'pending') continue

    const prereqsMet = prereqs.every((p) => {
      const s = statusMap.get(p as SetupPhase)
      return s === 'completed' || s === 'skipped'
    })

    if (prereqsMet) {
      ready.push(phase as SetupPhase)
    }
  }

  return ready
}

/**
 * Advance the pipeline: detect ready phases and trigger them.
 * Returns the phases that were triggered.
 */
export async function advancePipeline(locationId: string): Promise<SetupPhase[]> {
  const phases = await getLocationPhases(locationId)
  if (phases.length === 0) {
    // Pipeline not initialized — backfill first
    const backfilled = await initializeAndBackfill(locationId)
    return advancePipelineFromPhases(locationId, backfilled)
  }

  return advancePipelineFromPhases(locationId, phases)
}

async function advancePipelineFromPhases(locationId: string, phases: PhaseRecord[]): Promise<SetupPhase[]> {
  const triggered: SetupPhase[] = []

  // First: detect any manually-completed work and mark those phases done
  const detectedComplete = await detectCompletedPhases(locationId)
  const statusMap = new Map(phases.map((p) => [p.phase, p.status]))
  for (const phase of detectedComplete) {
    if (statusMap.get(phase) === 'pending' || statusMap.get(phase) === 'running') {
      await completePhase(locationId, phase)
      triggered.push(phase)
    }
  }

  // Re-fetch phases after backfill so getReadyPhases sees updated state
  const currentPhases = triggered.length > 0
    ? await getLocationPhases(locationId)
    : phases

  const ready = getReadyPhases(currentPhases)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
  const apiKey = process.env.CRON_SECRET
  const authHeaders: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {}

  for (const phase of ready) {
    switch (phase) {
      case 'gbp_connect':
        // Cannot auto-trigger — requires manual GBP mapping
        break

      case 'initial_sync':
        // Already happens inline during GBP mapping
        // Check if sync is actually done
        break

      case 'benchmark': {
        // Trigger performance metrics fetch
        await startPhase(locationId, 'benchmark')
        fetch(`${baseUrl}/api/locations/${locationId}/performance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
        }).catch(() => {})
        triggered.push('benchmark')
        break
      }

      case 'audit': {
        // Trigger audit + recommendations generation
        await startPhase(locationId, 'audit')
        fetch(`${baseUrl}/api/locations/${locationId}/recommendations/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
        }).catch(() => {})
        triggered.push('audit')
        break
      }

      case 'intake':
        // Cannot auto-trigger — requires human input
        break

      case 'recommendations':
        // Already triggered by audit phase completion
        break

      case 'optimization':
        // Cannot auto-trigger — requires AM approval of recommendations
        break

      case 'review_setup':
        // Already happens during GBP mapping (creates google review_source)
        // Check if it's done and mark complete
        await checkAndCompleteReviewSetup(locationId)
        triggered.push('review_setup')
        break

      case 'citations': {
        // Trigger citation audit
        await startPhase(locationId, 'citations')
        fetch(`${baseUrl}/api/citations/audit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ location_id: locationId }),
        }).catch(() => {})
        triggered.push('citations')
        break
      }

      case 'lander': {
        // Trigger lander generation
        await startPhase(locationId, 'lander')
        fetch(`${baseUrl}/api/locations/${locationId}/lander/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
        }).catch(() => {})
        triggered.push('lander')
        break
      }

      case 'notifications':
        // Auto-setup default notifications
        await setupDefaultNotifications(locationId)
        triggered.push('notifications')
        break

      case 'complete': {
        // All phases done — mark location as optimized
        await completePhase(locationId, 'complete')
        const adminClient = createAdminClient()
        await adminClient
          .from('locations')
          .update({ setup_status: 'optimized' })
          .eq('id', locationId)
        triggered.push('complete')
        break
      }
    }
  }

  return triggered
}

async function checkAndCompleteReviewSetup(locationId: string): Promise<void> {
  const adminClient = createAdminClient()
  const { count } = await adminClient
    .from('review_sources')
    .select('id', { count: 'exact', head: true })
    .eq('location_id', locationId)
    .in('sync_status', ['active', 'pending'])

  if (count && count > 0) {
    await completePhase(locationId, 'review_setup')
  }
}

async function setupDefaultNotifications(locationId: string): Promise<void> {
  const adminClient = createAdminClient()

  // Get the location's org
  const { data: location } = await adminClient
    .from('locations')
    .select('org_id')
    .eq('id', locationId)
    .single()

  if (!location) return

  // Create default notification subscriptions if none exist
  const { count } = await adminClient
    .from('notification_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('location_id', locationId)

  if (!count || count === 0) {
    await adminClient
      .from('notification_subscriptions')
      .insert([
        {
          org_id: location.org_id,
          location_id: locationId,
          alert_type: 'new_review',
          subscriber_type: 'all_members',
        },
        {
          org_id: location.org_id,
          location_id: locationId,
          alert_type: 'negative_review',
          subscriber_type: 'all_members',
        },
      ])
  }

  await completePhase(locationId, 'notifications')
}

/**
 * Calculate pipeline progress as a percentage.
 */
export function calculateProgress(phases: PhaseRecord[]): number {
  if (phases.length === 0) return 0
  // Exclude 'complete' from the count — it's a summary phase
  const actionPhases = phases.filter((p) => p.phase !== 'complete')
  if (actionPhases.length === 0) return 0
  const done = actionPhases.filter((p) => p.status === 'completed' || p.status === 'skipped').length
  return Math.round((done / actionPhases.length) * 100)
}
