import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgBySlug } from '@/lib/org'
import { getLocation } from '@/lib/locations'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { CitationTable } from './citation-table'

export const dynamic = 'force-dynamic'

export default async function LocationCitationsPage({
  params,
  searchParams,
}: {
  params: { orgSlug: string; locationId: string }
  searchParams: { status?: string }
}) {
  const org = await getOrgBySlug(params.orgSlug)
  const location = await getLocation(params.locationId, org.id)
  if (!location) notFound()

  const basePath = `/admin/${params.orgSlug}/locations/${params.locationId}`
  const adminClient = createAdminClient()

  // Fetch latest audit + all listings in parallel
  const [auditResult, listingsResult] = await Promise.all([
    adminClient
      .from('citation_audits')
      .select('*')
      .eq('location_id', location.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
    adminClient
      .from('citation_listings')
      .select('*')
      .eq('location_id', location.id)
      .order('directory_name', { ascending: true }),
  ])

  const audit = auditResult.data
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

  // Compute stats from all listings (not filtered)
  const totalFound = allListings.filter((l) => l.status !== 'not_listed').length
  const totalCorrect = allListings.filter((l) => l.nap_correct && l.status === 'found').length
  const totalIncorrect = allListings.filter((l) => l.status === 'action_needed').length
  const totalMissing = allListings.filter((l) => l.status === 'not_listed').length

  const hasData = allListings.length > 0

  return (
    <div>
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1.5 text-xs text-warm-gray mb-4">
        <Link href={`/admin/${params.orgSlug}`} className="hover:text-ink no-underline text-warm-gray">{org.name}</Link>
        <span>/</span>
        <Link href={basePath} className="hover:text-ink no-underline text-warm-gray">{location.name}</Link>
        <span>/</span>
        <span className="text-ink">Citations</span>
      </div>

      <h1 className="text-2xl font-serif text-ink mb-6">Citations</h1>

      {!hasData ? (
        <div className="text-center py-16">
          <div className="text-warm-gray text-sm mb-2">No citation data yet.</div>
          <div className="text-warm-gray/60 text-xs">
            Citations are audited automatically once a GBP profile is synced.
          </div>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <StatCard label="Found" value={totalFound} />
            <StatCard label="Correct" value={totalCorrect} color="emerald" />
            <StatCard label="Incorrect" value={totalIncorrect} color="amber" />
            <StatCard label="Missing" value={totalMissing} color="red" />
          </div>

          {/* Last audit info */}
          {audit && (
            <div className="text-xs text-warm-gray mb-4">
              Last audit: {audit.completed_at
                ? new Date(audit.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : audit.status === 'running' ? 'In progress...' : 'Pending'
              }
            </div>
          )}

          {/* Filter pills */}
          <div className="flex gap-1 mb-4">
            <FilterPill href={`${basePath}/citations`} active={!statusFilter} label="All" count={allListings.length} />
            <FilterPill href={`${basePath}/citations?status=correct`} active={statusFilter === 'correct'} label="Correct" count={totalCorrect} />
            <FilterPill href={`${basePath}/citations?status=incorrect`} active={statusFilter === 'incorrect'} label="Incorrect" count={totalIncorrect} />
            <FilterPill href={`${basePath}/citations?status=missing`} active={statusFilter === 'missing'} label="Missing" count={totalMissing} />
          </div>

          {/* Listings table */}
          <CitationTable listings={listings} />
        </>
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
