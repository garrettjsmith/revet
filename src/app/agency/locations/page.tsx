import { createAdminClient } from '@/lib/supabase/admin'
import { requireAgencyAdmin } from '@/lib/locations'
import { AgencyLocationTable } from '@/components/agency-location-table'

export const dynamic = 'force-dynamic'

export default async function AgencyLocationsPage() {
  await requireAgencyAdmin()
  const adminClient = createAdminClient()

  // Fetch all locations with org info, review source stats, and lander status
  const { data: rawLocations, error: locationsError } = await adminClient
    .from('locations')
    .select(`
      id,
      name,
      city,
      state,
      status,
      org_id,
      organizations!inner(id, name, slug),
      review_sources(sync_status, total_review_count, average_rating),
      local_landers(id)
    `)
    .neq('status', 'archived')
    .order('name')

  if (locationsError) {
    console.error('Error fetching locations:', locationsError)
  }

  // Fetch all orgs for the move dropdown
  const { data: orgs, error: orgsError } = await adminClient
    .from('organizations')
    .select('id, name, slug')
    .order('name')

  if (orgsError) {
    console.error('Error fetching organizations:', orgsError)
  }

  // Transform data for the client component
  const locations = (rawLocations || []).map((loc: any) => {
    const org = loc.organizations as any
    const reviewSource = Array.isArray(loc.review_sources)
      ? loc.review_sources[0]
      : loc.review_sources

    // Determine sync status
    let syncStatus: 'active' | 'pending' | 'error' | 'none' = 'none'
    if (reviewSource?.sync_status) {
      if (reviewSource.sync_status === 'active') {
        syncStatus = 'active'
      } else if (reviewSource.sync_status === 'pending') {
        syncStatus = 'pending'
      } else if (reviewSource.sync_status === 'error') {
        syncStatus = 'error'
      }
    }

    const landers = Array.isArray(loc.local_landers) ? loc.local_landers : []

    return {
      id: loc.id,
      name: loc.name,
      city: loc.city,
      state: loc.state,
      orgId: org?.id || loc.org_id,
      orgName: org?.name || 'Unknown',
      orgSlug: org?.slug || '',
      reviews: reviewSource?.total_review_count || 0,
      avgRating: reviewSource?.average_rating?.toFixed(1) || null,
      syncStatus,
      hasLander: landers.length > 0,
    }
  })

  return (
    <div className="p-8">
      <h1 className="text-2xl font-serif text-ink mb-6">All Locations</h1>

      <AgencyLocationTable
        locations={locations}
        orgs={orgs || []}
      />
    </div>
  )
}
