import { createAdminClient } from '@/lib/supabase/admin'
import { requireAgencyAdmin } from '@/lib/locations'
import { redirect } from 'next/navigation'
import { OrgAgentTable } from '@/components/org-agent-table'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function OrgAgentPage({
  params,
}: {
  params: { orgSlug: string }
}) {
  await requireAgencyAdmin()
  const supabase = createAdminClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, slug')
    .eq('slug', params.orgSlug)
    .single()

  if (!org) redirect('/agency/organizations')

  // Fetch locations with their agent configs and latest audit scores
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name, city, state, service_tier')
    .eq('org_id', org.id)
    .order('name')

  if (!locations) redirect('/agency/organizations')

  const locationIds = locations.map((l) => l.id)

  // Fetch agent configs and latest activity in parallel
  const [{ data: configs }, { data: audits }, { data: lastRuns }] = await Promise.all([
    supabase
      .from('location_agent_config')
      .select('*')
      .in('location_id', locationIds.length > 0 ? locationIds : ['']),
    supabase
      .from('audit_history')
      .select('location_id, score, created_at')
      .in('location_id', locationIds.length > 0 ? locationIds : [''])
      .order('created_at', { ascending: false }),
    supabase
      .from('agent_activity_log')
      .select('location_id, created_at')
      .in('location_id', locationIds.length > 0 ? locationIds : [''])
      .order('created_at', { ascending: false }),
  ])

  // Build lookup maps — latest per location
  const configMap = new Map(
    (configs || []).map((c) => [c.location_id, c])
  )
  const auditMap = new Map<string, number>()
  for (const a of audits || []) {
    if (!auditMap.has(a.location_id)) {
      auditMap.set(a.location_id, a.score)
    }
  }
  const lastRunMap = new Map<string, string>()
  for (const r of lastRuns || []) {
    if (!lastRunMap.has(r.location_id)) {
      lastRunMap.set(r.location_id, r.created_at)
    }
  }

  // Merge into table rows
  const rows = locations.map((loc) => {
    const config = configMap.get(loc.id)
    return {
      location_id: loc.id,
      location_name: loc.name,
      city: loc.city,
      state: loc.state,
      service_tier: loc.service_tier,
      enabled: config?.enabled ?? false,
      review_replies: (config?.review_replies ?? 'queue') as 'auto' | 'queue' | 'off',
      profile_updates: (config?.profile_updates ?? 'queue') as 'auto' | 'queue' | 'off',
      post_publishing: (config?.post_publishing ?? 'queue') as 'auto' | 'queue' | 'off',
      auto_reply_min_rating: config?.auto_reply_min_rating ?? 4,
      auto_reply_max_rating: config?.auto_reply_max_rating ?? 5,
      escalate_below_rating: config?.escalate_below_rating ?? 3,
      audit_score: auditMap.get(loc.id) ?? null,
      last_run: lastRunMap.get(loc.id) ?? null,
      has_config: !!config,
    }
  })

  // Check if brand is configured
  const { data: brandConfig } = await supabase
    .from('brand_config')
    .select('id, voice_selections')
    .eq('org_id', org.id)
    .single()

  const hasBrand = !!brandConfig?.voice_selections && Object.keys(brandConfig.voice_selections).length > 0

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/agency/${params.orgSlug}`}
              className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
            >
              {org.name}
            </Link>
            <span className="text-xs text-warm-gray">/</span>
          </div>
          <h1 className="text-2xl font-serif text-ink">Agent</h1>
        </div>
        {!hasBrand && (
          <Link
            href={`/agency/${params.orgSlug}/brand`}
            className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-4 py-2 no-underline hover:bg-amber-100 transition-colors"
          >
            Set up brand voice for AI-generated content
          </Link>
        )}
      </div>

      <OrgAgentTable
        orgId={org.id}
        orgSlug={org.slug}
        locations={rows}
      />
    </div>
  )
}
