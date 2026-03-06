import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgBySlug } from '@/lib/org'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function OrgCitationsPage({
  params,
}: {
  params: { orgSlug: string }
}) {
  const org = await getOrgBySlug(params.orgSlug)
  if (!org) notFound()

  const adminClient = createAdminClient()

  const { data: locations } = await adminClient
    .from('locations')
    .select('id, name, city, state')
    .eq('org_id', org.id)
    .eq('active', true)
    .order('name')

  const locationIds = (locations || []).map((l) => l.id)

  // Fetch citation data
  const [{ data: listings }, { data: audits }] = await Promise.all([
    locationIds.length > 0
      ? adminClient
          .from('citation_listings')
          .select('id, location_id, status, nap_correct')
          .in('location_id', locationIds)
      : Promise.resolve({ data: [] }),
    locationIds.length > 0
      ? adminClient
          .from('citation_audits')
          .select('id, location_id, status, completed_at')
          .in('location_id', locationIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ])

  // Build per-location stats
  const locationStats = new Map<string, { total: number; correct: number; issues: number }>()
  for (const l of listings || []) {
    if (!locationStats.has(l.location_id)) {
      locationStats.set(l.location_id, { total: 0, correct: 0, issues: 0 })
    }
    const s = locationStats.get(l.location_id)!
    s.total++
    if (l.status === 'not_listed' || l.status === 'action_needed') s.issues++
    else if (l.nap_correct) s.correct++
  }

  // Latest audit per location
  const latestAudit = new Map<string, string>()
  for (const a of audits || []) {
    if (!latestAudit.has(a.location_id) && a.completed_at) {
      latestAudit.set(a.location_id, a.completed_at)
    }
  }

  // Aggregates
  const totalCorrect = Array.from(locationStats.values()).reduce((sum, s) => sum + s.correct, 0)
  const totalIssues = Array.from(locationStats.values()).reduce((sum, s) => sum + s.issues, 0)
  const totalListings = Array.from(locationStats.values()).reduce((sum, s) => sum + s.total, 0)

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-6">Citations</h1>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="border border-warm-border rounded-xl p-4">
          <div className="text-xs text-warm-gray mb-1">Total Listings</div>
          <div className="text-2xl font-serif text-ink">{totalListings}</div>
        </div>
        <div className="border border-warm-border rounded-xl p-4">
          <div className="text-xs text-warm-gray mb-1">Correct</div>
          <div className="text-2xl font-serif text-emerald-600">{totalCorrect}</div>
        </div>
        <div className="border border-warm-border rounded-xl p-4">
          <div className="text-xs text-warm-gray mb-1">Issues</div>
          <div className="text-2xl font-serif text-amber-600">{totalIssues}</div>
        </div>
      </div>

      {(locations || []).length === 0 ? (
        <div className="text-center py-16 text-sm text-warm-gray">
          No active locations found.
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
              </tr>
            </thead>
            <tbody>
              {(locations || []).map((loc) => {
                const stats = locationStats.get(loc.id)
                const lastAudit = latestAudit.get(loc.id)
                return (
                  <tr key={loc.id} className="border-b border-warm-border/50 last:border-0 hover:bg-warm-light/20 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/${params.orgSlug}/locations/${loc.id}/citations`}
                        className="font-medium text-ink hover:underline no-underline"
                      >
                        {loc.name}
                      </Link>
                      {(loc.city || loc.state) && (
                        <div className="text-[10px] text-warm-gray mt-0.5">
                          {[loc.city, loc.state].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="text-center px-3 py-3 text-ink">{stats?.total || '--'}</td>
                    <td className="text-center px-3 py-3">
                      <span className={stats?.correct ? 'text-emerald-600' : 'text-warm-gray'}>
                        {stats?.correct || '--'}
                      </span>
                    </td>
                    <td className="text-center px-3 py-3">
                      {(stats?.issues || 0) > 0 ? (
                        <span className="text-amber-600 font-medium">{stats!.issues}</span>
                      ) : stats ? (
                        <span className="text-emerald-600">0</span>
                      ) : (
                        <span className="text-warm-gray">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-warm-gray">
                      {lastAudit
                        ? new Date(lastAudit).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : '--'}
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
