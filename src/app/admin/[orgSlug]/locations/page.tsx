import { getOrgBySlug } from '@/lib/org'
import { getOrgLocations, checkAgencyAdmin } from '@/lib/locations'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { LocationTable } from '@/components/location-table'

export const dynamic = 'force-dynamic'

export default async function LocationsPage({ params }: { params: { orgSlug: string } }) {
  const org = await getOrgBySlug(params.orgSlug)
  const locations = await getOrgLocations(org.id)
  const basePath = `/admin/${params.orgSlug}`
  const adminClient = createAdminClient()

  // Check if user is agency admin
  const isAgencyAdmin = await checkAgencyAdmin()

  // Fetch all organizations if agency admin
  const allOrgs = isAgencyAdmin
    ? await adminClient
        .from('organizations')
        .select('id, name, slug')
        .order('name')
        .then((res) => res.data || [])
    : []

  const locationIds = locations.map((l) => l.id)

  // Run both queries in parallel
  const [{ data: reviewSources }, { data: gbpProfiles }] = locationIds.length > 0
    ? await Promise.all([
        adminClient
          .from('review_sources')
          .select('location_id, total_review_count, average_rating, sync_status')
          .in('location_id', locationIds)
          .eq('platform', 'google'),
        adminClient
          .from('gbp_profiles')
          .select('location_id, primary_category_name, open_status')
          .in('location_id', locationIds),
      ])
    : [{ data: [] }, { data: [] }]

  const sourceByLocation = new Map((reviewSources || []).map((s) => [s.location_id, s]))
  const profileByLocation = new Map((gbpProfiles || []).map((p) => [p.location_id, p]))

  // Build location rows
  const locationRows = locations.map((loc) => {
    const source = sourceByLocation.get(loc.id)
    const profile = profileByLocation.get(loc.id)
    return {
      location: loc,
      reviews: source?.total_review_count || 0,
      avgRating: source?.average_rating ? Number(source.average_rating).toFixed(1) : '—',
      synced: source?.sync_status === 'active',
      syncStatus: source?.sync_status || null,
      hasSource: !!source,
      category: profile?.primary_category_name || null,
      gbpStatus: profile?.open_status || null,
    }
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif text-ink">Locations</h1>
        <Link
          href={`${basePath}/locations/new`}
          className="px-5 py-2 bg-ink hover:bg-ink/90 text-cream text-sm font-medium rounded-full no-underline transition-colors"
        >
          + New Location
        </Link>
      </div>

      {locations.length === 0 ? (
        <div className="border border-warm-border rounded-xl overflow-hidden">
          <div className="text-center py-16 text-warm-gray text-sm">
            No locations yet. Add your first location to get started.
          </div>
        </div>
      ) : (
        <LocationTable
          locations={locationRows}
          orgSlug={params.orgSlug}
          isAgencyAdmin={isAgencyAdmin}
          allOrgs={allOrgs}
        />
      )}
    </div>
  )
}
