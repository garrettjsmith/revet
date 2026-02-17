import { createAdminClient } from '@/lib/supabase/admin'
import { requireAgencyAdmin } from '@/lib/locations'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { RunAuditButtonClient } from '../run-audit-button'
import { CitationTable } from '@/app/admin/[orgSlug]/locations/[locationId]/citations/citation-table'

export const dynamic = 'force-dynamic'

export default async function AgencyCitationDetailPage({
  params,
  searchParams,
}: {
  params: { locationId: string }
  searchParams: { status?: string }
}) {
  await requireAgencyAdmin()

  const adminClient = createAdminClient()

  // Fetch location with org info
  const { data: location } = await adminClient
    .from('locations')
    .select('id, name, city, state, phone, address_line1, postal_code, country, brightlocal_report_id, org_id, organizations(name, slug)')
    .eq('id', params.locationId)
    .single()

  if (!location) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgData = location.organizations as any

  // Fetch audit history + all listings in parallel
  const [auditResult, auditsHistoryResult, listingsResult] = await Promise.all([
    adminClient
      .from('citation_audits')
      .select('*')
      .eq('location_id', location.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
    adminClient
      .from('citation_audits')
      .select('id, status, created_at, completed_at, total_found, total_correct, total_incorrect, total_missing, last_error')
      .eq('location_id', location.id)
      .order('created_at', { ascending: false })
      .limit(10),
    adminClient
      .from('citation_listings')
      .select('*')
      .eq('location_id', location.id)
      .order('directory_name', { ascending: true }),
  ])

  const latestAudit = auditResult.data
  const auditHistory = auditsHistoryResult.data || []
  const allListings = listingsResult.data || []

  // Filter by status if provided
  const statusFilter = searchParams.status
  const listings = statusFilter
    ? allListings.filter((l) => {
        if (statusFilter === 'correct') return l.nap_correct && l.status === 'found'
        if (statusFilter === 'incorrect') return l.status === 'action_needed'
        if (statusFilter === 'missing') return l.status === 'not_listed'
        return true
      })
    : allListings

  // Compute stats
  const totalFound = allListings.filter((l) => l.status !== 'not_listed').length
  const totalCorrect = allListings.filter((l) => l.nap_correct && l.status === 'found').length
  const totalIncorrect = allListings.filter((l) => l.status === 'action_needed').length
  const totalMissing = allListings.filter((l) => l.status === 'not_listed').length
  const basePath = `/agency/citations/${params.locationId}`

  return (
    <div>
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1.5 text-xs text-warm-gray mb-4">
        <Link href="/agency/citations" className="hover:text-ink no-underline text-warm-gray">Citations</Link>
        <span>/</span>
        <span className="text-ink">{location.name}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-serif text-ink">{location.name}</h1>
          <p className="text-xs text-warm-gray mt-1">
            {[location.city, location.state].filter(Boolean).join(', ')}
            {orgData?.name ? ` · ${orgData.name}` : ''}
          </p>
        </div>
        <RunAuditButtonClient locationId={location.id} />
      </div>

      {/* Config card — BrightLocal mapping */}
      <div className="border border-warm-border rounded-xl p-5 mb-6">
        <h2 className="text-sm font-medium text-ink mb-3">BrightLocal Configuration</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-warm-gray">Report ID:</span>{' '}
            <span className="text-ink font-mono">
              {location.brightlocal_report_id || <span className="text-warm-gray italic">Not mapped</span>}
            </span>
          </div>
          <div>
            <span className="text-warm-gray">Business Name:</span>{' '}
            <span className="text-ink">{location.name}</span>
          </div>
          <div>
            <span className="text-warm-gray">Address:</span>{' '}
            <span className="text-ink">{location.address_line1 || '--'}</span>
          </div>
          <div>
            <span className="text-warm-gray">Phone:</span>{' '}
            <span className="text-ink font-mono">{location.phone || '--'}</span>
          </div>
        </div>
        {!location.brightlocal_report_id && (
          <p className="text-[11px] text-warm-gray mt-3">
            Running an audit will automatically create a BrightLocal Citation Tracker report for this location.
          </p>
        )}
      </div>

      {/* Summary cards */}
      {allListings.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <StatCard label="Found" value={totalFound} />
          <StatCard label="Correct" value={totalCorrect} color="emerald" />
          <StatCard label="Incorrect" value={totalIncorrect} color="amber" />
          <StatCard label="Missing" value={totalMissing} color="red" />
        </div>
      )}

      {/* Filter pills + listings table */}
      {allListings.length > 0 ? (
        <>
          <div className="flex gap-1 mb-4">
            <FilterPill href={basePath} active={!statusFilter} label="All" count={allListings.length} />
            <FilterPill href={`${basePath}?status=correct`} active={statusFilter === 'correct'} label="Correct" count={totalCorrect} />
            <FilterPill href={`${basePath}?status=incorrect`} active={statusFilter === 'incorrect'} label="Incorrect" count={totalIncorrect} />
            <FilterPill href={`${basePath}?status=missing`} active={statusFilter === 'missing'} label="Missing" count={totalMissing} />
          </div>

          <CitationTable listings={listings} />
        </>
      ) : (
        <div className="text-center py-12 text-sm text-warm-gray">
          No citation listings yet. Run an audit to scan directories.
        </div>
      )}

      {/* Audit history */}
      {auditHistory.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-ink mb-3">Audit History</h2>
          <div className="border border-warm-border rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-warm-border bg-warm-light/30">
                  <th className="text-left px-4 py-3 font-medium text-warm-gray">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-warm-gray">Status</th>
                  <th className="text-center px-3 py-3 font-medium text-warm-gray">Found</th>
                  <th className="text-center px-3 py-3 font-medium text-warm-gray">Correct</th>
                  <th className="text-center px-3 py-3 font-medium text-warm-gray">Incorrect</th>
                  <th className="text-center px-3 py-3 font-medium text-warm-gray">Missing</th>
                </tr>
              </thead>
              <tbody>
                {auditHistory.map((audit) => (
                  <tr key={audit.id} className="border-b border-warm-border/50 last:border-0">
                    <td className="px-4 py-3 text-warm-gray">
                      {new Date(audit.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      <AuditStatusBadge status={audit.status} error={audit.last_error} />
                    </td>
                    <td className="text-center px-3 py-3 text-ink">{audit.total_found ?? '--'}</td>
                    <td className="text-center px-3 py-3 text-emerald-600">{audit.total_correct ?? '--'}</td>
                    <td className="text-center px-3 py-3 text-amber-600">{audit.total_incorrect ?? '--'}</td>
                    <td className="text-center px-3 py-3 text-red-600">{audit.total_missing ?? '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Server Sub-Components ───────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  const colorClasses: Record<string, string> = {
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
  }
  return (
    <div className="border border-warm-border rounded-xl p-4">
      <div className="text-xs text-warm-gray mb-1">{label}</div>
      <div className={`text-2xl font-serif ${colorClasses[color || ''] || 'text-ink'}`}>{value}</div>
    </div>
  )
}

function FilterPill({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 text-xs rounded-full no-underline whitespace-nowrap transition-colors ${
        active ? 'bg-ink text-cream' : 'text-warm-gray hover:text-ink hover:bg-warm-light'
      }`}
    >
      {label}
      {count > 0 && <span className={`ml-1.5 ${active ? 'text-cream/70' : 'text-warm-gray/60'}`}>{count}</span>}
    </Link>
  )
}

function AuditStatusBadge({ status, error }: { status: string; error: string | null }) {
  const config: Record<string, { label: string; classes: string }> = {
    pending: { label: 'Pending', classes: 'text-warm-gray bg-warm-light' },
    running: { label: 'Running', classes: 'text-blue-700 bg-blue-50' },
    completed: { label: 'Completed', classes: 'text-emerald-700 bg-emerald-50' },
    failed: { label: 'Failed', classes: 'text-red-700 bg-red-50' },
  }
  const c = config[status] || { label: status, classes: 'text-warm-gray bg-warm-light' }

  return (
    <span title={error || undefined} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${c.classes}`}>
      {c.label}
    </span>
  )
}
