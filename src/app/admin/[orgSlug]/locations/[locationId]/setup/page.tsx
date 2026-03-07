import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgBySlug } from '@/lib/org'
import { getLocation, checkAgencyAdmin } from '@/lib/locations'
import { notFound, redirect } from 'next/navigation'
import { getLocationPhases, PHASE_LABELS, PIPELINE_STAGES, getStageStatus } from '@/lib/pipeline'
import type { SetupPhase, PhaseStatus } from '@/lib/pipeline'
import { SetupFlow } from '@/components/setup-flow'

export const dynamic = 'force-dynamic'

export default async function LocationSetupPage({
  params,
}: {
  params: { orgSlug: string; locationId: string }
}) {
  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) redirect(`/admin/${params.orgSlug}`)

  const org = await getOrgBySlug(params.orgSlug)
  const location = await getLocation(params.locationId, org.id)
  if (!location) notFound()

  const adminClient = createAdminClient()

  // Fetch data in parallel
  const [
    phases,
    { data: brandConfig },
    { data: agentConfig },
    { data: auditHistory },
    { data: locationData },
  ] = await Promise.all([
    getLocationPhases(params.locationId),
    adminClient
      .from('brand_config')
      .select('id, voice_selections, primary_color')
      .eq('org_id', org.id)
      .single(),
    adminClient
      .from('location_agent_config')
      .select('*')
      .eq('location_id', params.locationId)
      .single(),
    adminClient
      .from('audit_history')
      .select('score, created_at')
      .eq('location_id', params.locationId)
      .order('created_at', { ascending: false })
      .limit(1),
    adminClient
      .from('locations')
      .select('intake_completed_at')
      .eq('id', params.locationId)
      .single(),
  ])

  const hasBrandVoice = !!brandConfig?.voice_selections && Object.keys(brandConfig.voice_selections).length > 0
  const hasIntake = !!locationData?.intake_completed_at
  const hasAgentConfig = !!agentConfig
  const auditScore = auditHistory?.[0]?.score ?? null

  // Build pipeline status
  const statusMap = new Map<SetupPhase, PhaseStatus>(
    phases.map((p) => [p.phase as SetupPhase, p.status as PhaseStatus])
  )
  const stages = PIPELINE_STAGES.map((stage) => ({
    ...stage,
    status: getStageStatus(stage, statusMap),
    phases: stage.phases.map((phase) => ({
      phase,
      label: PHASE_LABELS[phase],
      status: statusMap.get(phase) || 'pending',
    })),
  }))

  return (
    <SetupFlow
      orgId={org.id}
      orgSlug={params.orgSlug}
      locationId={params.locationId}
      locationName={location.name}
      hasIntake={hasIntake}
      hasBrandVoice={hasBrandVoice}
      hasAgentConfig={hasAgentConfig}
      agentConfig={agentConfig}
      auditScore={auditScore}
      stages={stages}
      brandVoice={brandConfig?.voice_selections}
    />
  )
}
