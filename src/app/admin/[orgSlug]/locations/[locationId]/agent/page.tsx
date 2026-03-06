import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgBySlug } from '@/lib/org'
import { getLocation, checkAgencyAdmin } from '@/lib/locations'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { AgentConfigPanel } from '@/components/agent-config-panel'

export const dynamic = 'force-dynamic'

export default async function AgentPage({
  params,
}: {
  params: { orgSlug: string; locationId: string }
}) {
  const org = await getOrgBySlug(params.orgSlug)
  const location = await getLocation(params.locationId, org.id)
  if (!location) notFound()

  const isAdmin = await checkAgencyAdmin()
  const adminClient = createAdminClient()
  const basePath = `/admin/${params.orgSlug}/locations/${params.locationId}`

  const { data: config } = await adminClient
    .from('location_agent_config')
    .select('*')
    .eq('location_id', location.id)
    .single()

  const [{ data: activity }, { data: brandConfig }, { count: pendingCount }] = await Promise.all([
    adminClient
      .from('agent_activity_log')
      .select('*')
      .eq('location_id', location.id)
      .order('created_at', { ascending: false })
      .limit(50),
    adminClient
      .from('brand_config')
      .select('voice_selections')
      .eq('org_id', org.id)
      .single(),
    adminClient
      .from('profile_recommendations')
      .select('*', { count: 'exact', head: true })
      .eq('location_id', location.id)
      .in('status', ['pending', 'client_review']),
  ])

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Link
          href={`/admin/${params.orgSlug}/locations`}
          className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
        >
          Locations
        </Link>
        <span className="text-xs text-warm-gray">/</span>
        <Link
          href={basePath}
          className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
        >
          {location.name}
        </Link>
        <span className="text-xs text-warm-gray">/</span>
      </div>

      <h1 className="text-2xl font-serif text-ink mb-6">Agent</h1>

      <AgentConfigPanel
        locationId={location.id}
        config={config}
        activity={activity || []}
        isAdmin={isAdmin}
        orgSlug={params.orgSlug}
        brandVoice={brandConfig?.voice_selections}
        pendingCount={pendingCount ?? 0}
        recsHref={`${basePath}/recommendations`}
      />
    </div>
  )
}
