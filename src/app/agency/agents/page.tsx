import { createAdminClient } from '@/lib/supabase/admin'
import { requireAgencyAdmin } from '@/lib/locations'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

type TrustLevel = 'auto' | 'queue' | 'off'

function TrustBadge({ value }: { value: TrustLevel }) {
  const styles = {
    auto: 'bg-emerald-50 text-emerald-700',
    queue: 'bg-amber-50 text-amber-700',
    off: 'bg-gray-100 text-gray-500',
  }
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full ${styles[value]}`}>
      {value === 'auto' ? 'Auto' : value === 'queue' ? 'Queue' : 'Off'}
    </span>
  )
}

export default async function AgencyAgentsPage() {
  await requireAgencyAdmin()
  const adminClient = createAdminClient()

  // Fetch all locations with their agent configs, org info, and latest audit
  const [{ data: locations }, { data: configs }, { data: orgs }] = await Promise.all([
    adminClient
      .from('locations')
      .select('id, name, city, state, org_id, service_tier')
      .eq('active', true)
      .order('name'),
    adminClient
      .from('location_agent_config')
      .select('*'),
    adminClient
      .from('organizations')
      .select('id, name, slug'),
  ])

  const configMap = new Map((configs || []).map((c: any) => [c.location_id, c]))
  const orgMap = new Map((orgs || []).map((o: any) => [o.id, o]))

  // Fetch latest audit scores
  const locationIds = (locations || []).map((l: any) => l.id)
  const { data: audits } = locationIds.length > 0
    ? await adminClient
        .from('audit_history')
        .select('location_id, score, created_at')
        .in('location_id', locationIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  const auditMap = new Map<string, number>()
  for (const a of audits || []) {
    if (!auditMap.has(a.location_id)) auditMap.set(a.location_id, a.score)
  }

  // Latest activity per location
  const { data: lastRuns } = locationIds.length > 0
    ? await adminClient
        .from('agent_activity_log')
        .select('location_id, created_at')
        .in('location_id', locationIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  const lastRunMap = new Map<string, string>()
  for (const r of lastRuns || []) {
    if (!lastRunMap.has(r.location_id)) lastRunMap.set(r.location_id, r.created_at)
  }

  // Build rows
  const rows = (locations || []).map((loc: any) => {
    const config = configMap.get(loc.id)
    const org = orgMap.get(loc.org_id)
    return {
      id: loc.id,
      name: loc.name,
      city: loc.city,
      state: loc.state,
      orgName: org?.name || 'Unknown',
      orgSlug: org?.slug || '',
      enabled: config?.enabled ?? false,
      review_replies: (config?.review_replies ?? 'queue') as TrustLevel,
      post_publishing: (config?.post_publishing ?? 'queue') as TrustLevel,
      profile_skills: (config?.profile_skills ?? null) as Record<string, TrustLevel> | null,
      audit_score: auditMap.get(loc.id) ?? null,
      last_run: lastRunMap.get(loc.id) ?? null,
    }
  })

  // Stats
  const totalLocations = rows.length
  const enabledCount = rows.filter((r) => r.enabled).length
  const autoCount = rows.filter((r) => {
    const hasAutoSkill = r.profile_skills ? Object.values(r.profile_skills).some((v) => v === 'auto') : false
    return r.review_replies === 'auto' || hasAutoSkill || r.post_publishing === 'auto'
  }).length

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-6">Agents</h1>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Total Locations</div>
          <div className="text-2xl font-bold font-mono text-cream">{totalLocations}</div>
        </div>
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-emerald-400 uppercase tracking-wider mb-1">Agent Enabled</div>
          <div className="text-2xl font-bold font-mono text-cream">{enabledCount}</div>
        </div>
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-amber-400 uppercase tracking-wider mb-1">Auto Actions</div>
          <div className="text-2xl font-bold font-mono text-cream">{autoCount}</div>
        </div>
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="text-center py-16 text-sm text-warm-gray">
          No active locations found.
        </div>
      ) : (
        <div className="border border-warm-border rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-warm-border bg-warm-light/30">
                <th className="text-left px-4 py-3 font-medium text-warm-gray">Location</th>
                <th className="text-left px-3 py-3 font-medium text-warm-gray">Brand</th>
                <th className="text-center px-3 py-3 font-medium text-warm-gray">Status</th>
                <th className="text-center px-3 py-3 font-medium text-warm-gray">Reviews</th>
                <th className="text-center px-3 py-3 font-medium text-warm-gray">Profile</th>
                <th className="text-center px-3 py-3 font-medium text-warm-gray">Posts</th>
                <th className="text-center px-3 py-3 font-medium text-warm-gray">Score</th>
                <th className="text-right px-4 py-3 font-medium text-warm-gray">Last Run</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-warm-border/50 last:border-0 hover:bg-warm-light/20 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/${row.orgSlug}/locations/${row.id}/agent`}
                      className="font-medium text-ink hover:underline no-underline"
                    >
                      {row.name}
                    </Link>
                    {(row.city || row.state) && (
                      <div className="text-[10px] text-warm-gray mt-0.5">
                        {[row.city, row.state].filter(Boolean).join(', ')}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/agency/${row.orgSlug}/agent`}
                      className="text-xs text-warm-gray hover:text-ink no-underline"
                    >
                      {row.orgName}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-center">
                    {row.enabled ? (
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">On</span>
                    ) : (
                      <span className="text-[10px] text-warm-gray bg-warm-light px-2 py-0.5 rounded-full">Off</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <TrustBadge value={row.review_replies} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    {(() => {
                      const skills = row.profile_skills
                      if (!skills) return <TrustBadge value="queue" />
                      const vals = Object.values(skills)
                      const autoCount = vals.filter((v) => v === 'auto').length
                      const queueCount = vals.filter((v) => v === 'queue').length
                      const offCount = vals.filter((v) => v === 'off').length
                      if (offCount === vals.length) return <TrustBadge value="off" />
                      if (autoCount === vals.length) return <TrustBadge value="auto" />
                      if (queueCount === vals.length) return <TrustBadge value="queue" />
                      return <span className="text-[10px] text-ink">{autoCount}A/{queueCount}Q/{offCount}O</span>
                    })()}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <TrustBadge value={row.post_publishing} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    {row.audit_score !== null ? (
                      <span className={`font-mono font-medium ${
                        row.audit_score >= 80 ? 'text-emerald-600' :
                        row.audit_score >= 50 ? 'text-amber-600' :
                        'text-red-600'
                      }`}>
                        {row.audit_score}
                      </span>
                    ) : (
                      <span className="text-warm-gray">--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-warm-gray">
                    {row.last_run
                      ? formatRelativeTime(row.last_run)
                      : 'Never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
