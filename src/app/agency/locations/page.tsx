import { createAdminClient } from '@/lib/supabase/admin'
import { requireAgencyAdmin } from '@/lib/locations'
import { AgencyLocationTable } from '@/components/agency-location-table'

export const dynamic = 'force-dynamic'

export default async function AgencyLocationsPage() {
  await requireAgencyAdmin()
  const adminClient = createAdminClient()

  // Fetch locations with separate queries to avoid PostgREST join issues
  const [locationsResult, orgsResult, reviewSourcesResult, landersResult, accountManagersResult] = await Promise.all([
    adminClient
      .from('locations')
      .select('id, name, city, state, org_id, status, service_tier')
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
    adminClient
      .from('org_account_managers')
      .select('org_id, user_id'),
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

  // Resolve account manager emails
  const managerRows = accountManagersResult.data || []
  const managerUserIds = Array.from(new Set(managerRows.map((m: any) => m.user_id)))
  const managerEmailMap = new Map<string, string>()
  for (const uid of managerUserIds) {
    const { data } = await adminClient.auth.admin.getUserById(uid)
    if (data?.user?.email) {
      managerEmailMap.set(uid, data.user.email)
    }
  }

  // Build org → managers lookup: { orgId: [{ userId, email }] }
  const orgManagerMap = new Map<string, { userId: string; email: string }[]>()
  for (const row of managerRows) {
    const email = managerEmailMap.get(row.user_id)
    if (!email) continue
    if (!orgManagerMap.has(row.org_id)) {
      orgManagerMap.set(row.org_id, [])
    }
    orgManagerMap.get(row.org_id)!.push({ userId: row.user_id, email })
  }

  // Build serializable managers list for client component
  const orgManagers: Record<string, { userId: string; email: string }[]> = {}
  Array.from(orgManagerMap.entries()).forEach(([orgId, managers]) => {
    orgManagers[orgId] = managers
  })

  // Flat list of all agency team members for assignment dropdown
  const agencyMembers = managerUserIds.map((uid) => ({
    id: uid,
    email: managerEmailMap.get(uid) || '',
  })).filter((m) => m.email)

  // Also include any agency admins not yet in the managers list
  const { data: adminMembers } = await adminClient
    .from('org_members')
    .select('user_id')
    .eq('is_agency_admin', true)

  for (const am of adminMembers || []) {
    if (!agencyMembers.find((m) => m.id === am.user_id)) {
      const { data } = await adminClient.auth.admin.getUserById(am.user_id)
      if (data?.user?.email) {
        agencyMembers.push({ id: am.user_id, email: data.user.email })
      }
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
        serviceTier: loc.service_tier || 'standard',
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
        orgManagers={orgManagers}
        agencyMembers={agencyMembers}
      />
    </div>
  )
}
