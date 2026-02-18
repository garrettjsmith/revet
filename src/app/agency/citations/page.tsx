import { createAdminClient } from '@/lib/supabase/admin'
import { requireAgencyAdmin } from '@/lib/locations'
import Link from 'next/link'
import { RunAllAuditsButton } from './run-all-audits-button'
import { RunAuditButtonClient } from './run-audit-button'

export const dynamic = 'force-dynamic'

export default async function AgencyCitationsPage() {
  await requireAgencyAdmin()

  const adminClient = createAdminClient()

  // Fetch aggregate data in parallel
  const [
    { data: locations },
    { data: audits },
    { data: listings },
  ] = await Promise.all([
    adminClient
      .from('locations')
      .select('id, name, city, state, brightlocal_report_id, org_id, organizations(name, slug)')
      .eq('active', true)
      .order('name'),
    adminClient
      .from('citation_audits')
      .select('id, location_id, status, completed_at, total_found, total_correct, total_incorrect, total_missing')
      .order('created_at', { ascending: false }),
    adminClient
      .from('citation_listings')
      .select('id, location_id, status, nap_correct')
  ])

  // Build per-location stats from listings
  const locationStats = new Map<string, { total: number; correct: number; incorrect: number; missing: number }>()
  for (const l of listings || []) {
    if (!locationStats.has(l.location_id)) {
      locationStats.set(l.location_id, { total: 0, correct: 0, incorrect: 0, missing: 0 })
    }
    const s = locationStats.get(l.location_id)!
    s.total++
    if (l.status === 'not_listed') s.missing++
    else if (l.status === 'action_needed') s.incorrect++
    else if (l.nap_correct) s.correct++
  }

  // Latest audit per location
  const latestAudit = new Map<string, typeof audits extends (infer T)[] | null ? T : never>()
  for (const a of audits || []) {
    if (!latestAudit.has(a.location_id)) {
      latestAudit.set(a.location_id, a)
    }
  }

  // Aggregate totals
  const totalLocations = locations?.length || 0
  const mappedLocations = (locations || []).filter((l) => l.brightlocal_report_id).length
  const totalIssues = (listings || []).filter((l) => l.status === 'action_needed' || l.status === 'not_listed').length
  const totalCorrect = (listings || []).filter((l) => l.nap_correct && l.status !== 'not_listed').length

  // Sort locations: those with issues first, then by name
  const sortedLocations = (locations || []).sort((a, b) => {
    const aIssues = (locationStats.get(a.id)?.incorrect || 0) + (locationStats.get(a.id)?.missing || 0)
    const bIssues = (locationStats.get(b.id)?.incorrect || 0) + (locationStats.get(b.id)?.missing || 0)
    if (bIssues !== aIssues) return bIssues - aIssues
    return a.name.localeCompare(b.name)
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-serif text-ink">Citations</h1>
          <p className="text-xs text-warm-gray mt-1">
            {mappedLocations} of {totalLocations} locations mapped to BrightLocal
          </p>
        </div>
        <RunAllAuditsButton locationIds={(locations || []).map((l) => l.id)} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="border border-warm-border rounded-xl p-4">
          <div className="text-xs text-warm-gray mb-1">Locations Audited</div>
          <div className="text-2xl font-serif text-ink">{mappedLocations}</div>
        </div>
        <div className="border border-warm-border rounded-xl p-4">
          <div className="text-xs text-warm-gray mb-1">Total Correct</div>
          <div className="text-2xl font-serif text-emerald-600">{totalCorrect}</div>
        </div>
        <div className="border border-warm-border rounded-xl p-4">
          <div className="text-xs text-warm-gray mb-1">Total Issues</div>
          <div className="text-2xl font-serif text-amber-600">{totalIssues}</div>
        </div>
        <div className="border border-warm-border rounded-xl p-4">
          <div className="text-xs text-warm-gray mb-1">Accuracy</div>
          <div className="text-2xl font-serif text-ink">
            {totalCorrect + totalIssues > 0
              ? `${Math.round((totalCorrect / (totalCorrect + totalIssues)) * 100)}%`
              : '--'}
          </div>
        </div>
      </div>

      {/* Locations table */}
      {sortedLocations.length === 0 ? (
        <div className="text-center py-16 text-sm text-warm-gray">
          No locations found. Citations will be audited automatically once GBP profiles are synced.
        </div>
      ) : (
        <div className="border border-warm-border rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-warm-border bg-warm-light/30">
                <th className="text-left px-4 py-3 font-medium text-warm-gray">Location</th>
                <th className="text-center px-3 py-3 font-medium text-warm-gray">Found</th>
                <th className="text-center px-3 py-3 font-medium text-warm-gray">Correct</th>
                <th className="text-center px-3 py-3 font-medium text-warm-gray">Issues</th>
                <th className="text-left px-4 py-3 font-medium text-warm-gray">Last Audit</th>
                <th className="text-left px-4 py-3 font-medium text-warm-gray">Status</th>
                <th className="text-right px-4 py-3 font-medium text-warm-gray"></th>
              </tr>
            </thead>
            <tbody>
              {sortedLocations.map((loc) => {
                const stats = locationStats.get(loc.id)
                const audit = latestAudit.get(loc.id)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const orgData = loc.organizations as any
                const issues = (stats?.incorrect || 0) + (stats?.missing || 0)

                return (
                  <tr key={loc.id} className="border-b border-warm-border/50 last:border-0 hover:bg-warm-light/20 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/agency/citations/${loc.id}`}
                        className="font-medium text-ink hover:underline no-underline"
                      >
                        {loc.name}
                      </Link>
                      <div className="text-[11px] text-warm-gray">
                        {[loc.city, loc.state].filter(Boolean).join(', ')}
                        {orgData?.name ? ` · ${orgData.name}` : ''}
                      </div>
                    </td>
                    <td className="text-center px-3 py-3 text-ink">{stats?.total || '--'}</td>
                    <td className="text-center px-3 py-3">
                      <span className={stats?.correct ? 'text-emerald-600' : 'text-warm-gray'}>
                        {stats?.correct || '--'}
                      </span>
                    </td>
                    <td className="text-center px-3 py-3">
                      {issues > 0 ? (
                        <span className="text-amber-600 font-medium">{issues}</span>
                      ) : stats ? (
                        <span className="text-emerald-600">0</span>
                      ) : (
                        <span className="text-warm-gray">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-warm-gray">
                      {audit?.completed_at
                        ? new Date(audit.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : '--'}
                    </td>
                    <td className="px-4 py-3">
                      {!loc.brightlocal_report_id ? (
                        <span className="text-[10px] text-warm-gray bg-warm-light px-2 py-0.5 rounded-full">Not Mapped</span>
                      ) : audit?.status === 'running' ? (
                        <span className="text-[10px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">Running</span>
                      ) : audit?.status === 'failed' ? (
                        <span className="text-[10px] text-red-700 bg-red-50 px-2 py-0.5 rounded-full">Failed</span>
                      ) : issues > 0 ? (
                        <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Issues Found</span>
                      ) : stats && stats.total > 0 ? (
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Healthy</span>
                      ) : (
                        <span className="text-[10px] text-warm-gray bg-warm-light px-2 py-0.5 rounded-full">Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RunAuditButtonClient locationId={loc.id} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
