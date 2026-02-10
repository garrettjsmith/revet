import { createAdminClient } from '@/lib/supabase/admin'
import { requireAgencyAdmin } from '@/lib/locations'
import { AgencyLocationTable } from '@/components/agency-location-table'

export const dynamic = 'force-dynamic'

export default async function AgencyLocationsPage() {
  await requireAgencyAdmin()
  const adminClient = createAdminClient()

  // Fetch locations with separate queries to avoid PostgREST join issues
  const [locationsResult, orgsResult, reviewSourcesResult, landersResult] = await Promise.all([
    adminClient
      .from('locations')
      .select('id, name, city, state, org_id, status')
      .order('name'),
    adminClient
      .from('organizations')
      .select('id, name, slug')
      .order('name'),
    adminClient
      .from('review_sources')
      .select('location_id, sync_status, total_review_count, average_rating'),
    adminClient
      .from('local_landers')
      .select('location_id'),
  ])

  const { data: rawLocations, error: locationsError } = locationsResult
  const { data: orgs, error: orgsError } = orgsResult

  const landerLocationIds = new Set(
    (landersResult.data || []).map((l: any) => l.location_id)
  )

  // Collect errors to surface in UI
  const errors: string[] = []
  if (locationsError) {
    console.error('Error fetching locations:', locationsError)
    errors.push(`Locations: ${locationsError.message}`)
  }
  if (orgsError) {
    console.error('Error fetching organizations:', orgsError)
    errors.push(`Organizations: ${orgsError.message}`)
  }
  if (reviewSourcesResult.error) {
    console.error('Error fetching review sources:', reviewSourcesResult.error)
  }
  if (landersResult.error) {
    console.error('Error fetching landers:', landersResult.error)
  }

  // Build lookup maps
  const orgMap = new Map(
    (orgs || []).map((o: any) => [o.id, o])
  )
  const reviewSourceMap = new Map<string, any>()
  for (const rs of (reviewSourcesResult.data || [])) {
    if (!reviewSourceMap.has(rs.location_id)) {
      reviewSourceMap.set(rs.location_id, rs)
    }
  }

  // Filter and transform locations
  const locations = (rawLocations || [])
    .filter((loc: any) => loc.status !== 'archived')
    .map((loc: any) => {
      const org = orgMap.get(loc.org_id)
      const reviewSource = reviewSourceMap.get(loc.id)

      let syncStatus: 'active' | 'pending' | 'error' | 'none' = 'none'
      if (reviewSource?.sync_status) {
        if (reviewSource.sync_status === 'active') syncStatus = 'active'
        else if (reviewSource.sync_status === 'pending') syncStatus = 'pending'
        else if (reviewSource.sync_status === 'error') syncStatus = 'error'
      }

      return {
        id: loc.id,
        name: loc.name,
        city: loc.city,
        state: loc.state,
        orgId: loc.org_id,
        orgName: org?.name || 'Unknown',
        orgSlug: org?.slug || '',
        reviews: reviewSource?.total_review_count || 0,
        avgRating: reviewSource?.average_rating?.toFixed(1) || null,
        syncStatus,
        hasLander: landerLocationIds.has(loc.id),
      }
    })

  return (
    <div className="p-8">
      <h1 className="text-2xl font-serif text-ink mb-6">All Locations</h1>

      {errors.length > 0 && (
        <div className="mb-4 p-3 border border-red-200 bg-red-50 rounded-lg text-sm text-red-800">
          <div className="font-medium mb-1">Error loading data:</div>
          {errors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}

      <AgencyLocationTable
        locations={locations}
        orgs={orgs || []}
      />
    </div>
  )
}
