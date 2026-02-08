import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgBySlug } from '@/lib/org'
import { getOrgLocations } from '@/lib/locations'
import Link from 'next/link'
import { LocationTable } from '@/components/location-table'

export const dynamic = 'force-dynamic'

export default async function OrgDashboard({ params }: { params: { orgSlug: string } }) {
  const org = await getOrgBySlug(params.orgSlug)
  const locations = await getOrgLocations(org.id)
  const adminClient = createAdminClient()

  const locationIds = locations.map((l) => l.id)

  // Run all independent queries in parallel
  const [
    { data: reviewSources },
    { data: gbpProfiles },
    { count: totalReviews },
    { count: unreadReviews },
  ] = locationIds.length > 0
    ? await Promise.all([
        adminClient
          .from('review_sources')
          .select('location_id, total_review_count, average_rating, sync_status, last_synced_at')
          .in('location_id', locationIds)
          .eq('platform', 'google'),
        adminClient
          .from('gbp_profiles')
          .select('location_id, primary_category_name, open_status, sync_status')
          .in('location_id', locationIds),
        adminClient
          .from('reviews')
          .select('*', { count: 'exact', head: true })
          .in('location_id', locationIds),
        adminClient
          .from('reviews')
          .select('*', { count: 'exact', head: true })
          .in('location_id', locationIds)
          .eq('status', 'new'),
      ])
    : [{ data: [] }, { data: [] }, { count: 0 }, { count: 0 }]

  const sources = reviewSources || []
  const profiles = gbpProfiles || []

  // Compute avg rating across all locations
  const ratingsWithData = sources.filter((s) => s.average_rating != null)
  const avgRating = ratingsWithData.length > 0
    ? ratingsWithData.reduce((sum, s) => sum + Number(s.average_rating), 0) / ratingsWithData.length
    : null

  const statCards = [
    { label: 'Reviews', value: totalReviews || 0 },
    { label: 'Avg Rating', value: avgRating ? avgRating.toFixed(1) : '—' },
    { label: 'Unread', value: unreadReviews || 0 },
    { label: 'Locations', value: locations.length },
  ]

  // Build per-location stats
  const sourceByLocation = new Map(sources.map((s) => [s.location_id, s]))
  const profileByLocation = new Map(profiles.map((p) => [p.location_id, p]))

  const locationRows = locations.map((loc) => {
    const source = sourceByLocation.get(loc.id)
    const profile = profileByLocation.get(loc.id)
    return {
      location: loc,
      reviews: source?.total_review_count || 0,
      avgRating: source?.average_rating ? Number(source.average_rating).toFixed(1) : '—',
      synced: source?.sync_status === 'active',
      hasSource: !!source,
      category: profile?.primary_category_name || null,
      gbpStatus: profile?.open_status || null,
    }
  })

  const basePath = `/admin/${params.orgSlug}`

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-serif text-ink">Dashboard</h1>
        <Link
          href={`${basePath}/locations/new`}
          className="px-5 py-2 bg-ink hover:bg-ink/90 text-cream text-sm font-medium rounded-full no-underline transition-colors"
        >
          + New Location
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {statCards.map((s) => (
          <div key={s.label} className="bg-ink rounded-xl p-5">
            <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">{s.label}</div>
            <div className="text-2xl font-bold font-mono text-cream">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Locations breakdown */}
      <div>
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-ink">Locations</h2>
        </div>
        {locationRows.length === 0 ? (
          <div className="border border-warm-border rounded-xl overflow-hidden">
            <div className="p-12 text-center text-warm-gray text-sm">
              No locations yet.{' '}
              <Link href={`${basePath}/locations/new`} className="text-ink underline hover:no-underline">
                Add your first location
              </Link>
            </div>
          </div>
        ) : (
          <LocationTable locations={locationRows} orgSlug={params.orgSlug} compact />
        )}
      </div>
    </div>
  )
}
