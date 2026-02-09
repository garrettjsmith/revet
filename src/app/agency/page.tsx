import { createAdminClient } from '@/lib/supabase/admin'
import { requireAgencyAdmin } from '@/lib/locations'
import Link from 'next/link'
import { SyncNowButton } from '@/components/sync-now-button'

export const dynamic = 'force-dynamic'

function timeAgo(date: string | null): string {
  if (!date) return 'Never'
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

interface ReviewSource {
  id: string
  sync_status: 'pending' | 'active' | 'paused' | 'error'
  last_synced_at: string | null
  location_id: string
  platform: string
  locations: {
    name: string
    org_id: string
    organizations: {
      name: string
      slug: string
    }
  } | null
}

export default async function AgencyOverview() {
  await requireAgencyAdmin()

  const adminClient = createAdminClient()

  // Fetch all data in parallel
  const [
    { count: orgCount },
    { count: locationCount },
    { count: reviewCount },
    { data: reviewSources },
    { data: organizations },
  ] = await Promise.all([
    adminClient.from('organizations').select('*', { count: 'exact', head: true }),
    adminClient.from('locations').select('*', { count: 'exact', head: true }),
    adminClient.from('reviews').select('*', { count: 'exact', head: true }),
    adminClient
      .from('review_sources')
      .select('id, sync_status, last_synced_at, location_id, platform, locations(name, org_id, organizations(name, slug))'),
    adminClient
      .from('organizations')
      .select(`
        id,
        name,
        slug,
        locations(id),
        reviews:locations(reviews(id, rating))
      `)
      .order('name'),
  ])

  // Calculate sync health metrics
  const syncStatusCounts = {
    active: 0,
    pending: 0,
    paused: 0,
    error: 0,
  }

  reviewSources?.forEach((source: any) => {
    if (source.sync_status in syncStatusCounts) {
      syncStatusCounts[source.sync_status as keyof typeof syncStatusCounts]++
    }
  })

  const problematicSources = (reviewSources?.filter(
    (source: any) => source.sync_status !== 'active'
  ) || []) as unknown as ReviewSource[]

  // Calculate org metrics
  const orgMetrics = organizations?.map((org: any) => {
    const locationCount = org.locations?.length || 0
    const allReviews = org.locations?.flatMap((loc: any) => loc.reviews || []) || []
    const reviewCount = allReviews.length
    const avgRating = reviewCount > 0
      ? allReviews.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / reviewCount
      : null

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      locationCount,
      reviewCount,
      avgRating,
    }
  }) || []

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-8">Agency Overview</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Organizations</div>
          <div className="text-2xl font-bold font-mono text-cream">{orgCount || 0}</div>
        </div>
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Locations</div>
          <div className="text-2xl font-bold font-mono text-cream">{locationCount || 0}</div>
        </div>
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Reviews</div>
          <div className="text-2xl font-bold font-mono text-cream">{reviewCount || 0}</div>
        </div>
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Syncing</div>
          <div className="text-2xl font-bold font-mono text-cream">{syncStatusCounts.active}</div>
        </div>
      </div>

      {/* Sync Health Card */}
      <div className="border border-warm-border rounded-xl overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-warm-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Sync Health</h2>
          <SyncNowButton pendingCount={syncStatusCounts.pending + syncStatusCounts.error} />
        </div>
        <div className="px-5 py-4">
          {/* Status summary */}
          <div className="flex items-center gap-6 mb-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-sm text-emerald-600 font-medium">
                {syncStatusCounts.active} Active
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-sm text-amber-600 font-medium">
                {syncStatusCounts.pending} Pending
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-warm-border" />
              <span className="text-sm text-warm-gray font-medium">
                {syncStatusCounts.paused} Paused
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-sm text-red-600 font-medium">
                {syncStatusCounts.error} Errors
              </span>
            </div>
          </div>

          {/* Problematic sources table */}
          {problematicSources.length === 0 ? (
            <div className="py-6 text-center">
              <div className="flex items-center justify-center gap-2 text-emerald-600">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm font-medium">All sources syncing normally</span>
              </div>
            </div>
          ) : (
            <div className="border border-warm-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-warm-light/30 border-b border-warm-border">
                    <th className="text-left text-[11px] text-warm-gray uppercase tracking-wider font-medium px-5 py-3">
                      Location
                    </th>
                    <th className="text-left text-[11px] text-warm-gray uppercase tracking-wider font-medium px-5 py-3">
                      Organization
                    </th>
                    <th className="text-left text-[11px] text-warm-gray uppercase tracking-wider font-medium px-5 py-3">
                      Platform
                    </th>
                    <th className="text-left text-[11px] text-warm-gray uppercase tracking-wider font-medium px-5 py-3">
                      Status
                    </th>
                    <th className="text-left text-[11px] text-warm-gray uppercase tracking-wider font-medium px-5 py-3">
                      Last Synced
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {problematicSources.map((source) => {
                    const loc = source.locations as any
                    const org = loc?.organizations
                    const statusColors: Record<string, string> = {
                      pending: 'text-amber-600',
                      error: 'text-red-600',
                      paused: 'text-warm-gray',
                      active: 'text-emerald-600',
                    }
                    const dotColors: Record<string, string> = {
                      pending: 'bg-amber-500',
                      error: 'bg-red-500',
                      paused: 'bg-warm-border',
                      active: 'bg-emerald-500',
                    }

                    return (
                      <tr key={source.id} className="border-b border-warm-border/50 hover:bg-warm-light/50">
                        <td className="px-5 py-3.5">
                          <Link
                            href={`/admin/${org?.slug || ''}/locations/${source.location_id}`}
                            className="text-sm text-ink hover:underline"
                          >
                            {loc?.name || 'Unknown'}
                          </Link>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-warm-gray">
                          {org?.name || 'Unknown'}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-warm-gray capitalize">
                          {source.platform}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${dotColors[source.sync_status] || ''}`} />
                            <span className={`text-xs font-medium capitalize ${statusColors[source.sync_status] || ''}`}>
                              {source.sync_status}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-warm-gray">
                          {timeAgo(source.last_synced_at)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Organizations table */}
      <div className="border border-warm-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-warm-border">
          <h2 className="text-sm font-semibold text-ink">Organizations</h2>
        </div>
        {orgMetrics.length === 0 ? (
          <div className="p-12 text-center text-warm-gray text-sm">
            No organizations yet.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-warm-border">
                <th className="text-left text-[11px] text-warm-gray uppercase tracking-wider font-medium px-5 py-3">
                  Organization
                </th>
                <th className="text-left text-[11px] text-warm-gray uppercase tracking-wider font-medium px-5 py-3">
                  Locations
                </th>
                <th className="text-left text-[11px] text-warm-gray uppercase tracking-wider font-medium px-5 py-3">
                  Reviews
                </th>
                <th className="text-left text-[11px] text-warm-gray uppercase tracking-wider font-medium px-5 py-3">
                  Avg Rating
                </th>
                <th className="text-left text-[11px] text-warm-gray uppercase tracking-wider font-medium px-5 py-3">

                </th>
              </tr>
            </thead>
            <tbody>
              {orgMetrics.map((org: any) => (
                <tr key={org.id} className="border-b border-warm-border/50 hover:bg-warm-light/50">
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/admin/${org.slug}`}
                      className="text-sm font-medium text-ink hover:underline"
                    >
                      {org.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-warm-gray">
                    {org.locationCount}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-warm-gray">
                    {org.reviewCount}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-warm-gray">
                    {org.avgRating !== null ? org.avgRating.toFixed(1) : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/admin/${org.slug}`}
                      className="text-xs text-warm-gray hover:text-ink no-underline"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
