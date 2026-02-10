import { createAdminClient } from '@/lib/supabase/admin'
import { requireAgencyAdmin } from '@/lib/locations'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function AgencyLandersPage() {
  await requireAgencyAdmin()
  const adminClient = createAdminClient()

  const [landersResult, orgsResult] = await Promise.all([
    adminClient
      .from('local_landers')
      .select('id, slug, heading, active, location_id, org_id, created_at')
      .order('created_at', { ascending: false }),
    adminClient
      .from('organizations')
      .select('id, name, slug'),
  ])

  const landers = landersResult.data || []
  const orgs = orgsResult.data || []

  // If landers table doesn't exist yet, show a helpful message
  if (landersResult.error) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-serif text-ink mb-6">Landers</h1>
        <div className="border border-warm-border rounded-xl p-8 text-center">
          <p className="text-sm text-warm-gray">
            No landers have been created yet. Select locations from{' '}
            <Link href="/agency/locations" className="text-ink underline">All Locations</Link>{' '}
            and use "Create Landers" to get started.
          </p>
        </div>
      </div>
    )
  }

  // Build lookup maps
  const orgMap = new Map(orgs.map((o: any) => [o.id, o]))

  // Fetch location names for landers
  const locationIds = Array.from(new Set(landers.map((l: any) => l.location_id))) as string[]
  let locationMap = new Map<string, any>()
  if (locationIds.length > 0) {
    const { data: locations } = await adminClient
      .from('locations')
      .select('id, name, city, state')
      .in('id', locationIds)
    locationMap = new Map((locations || []).map((l: any) => [l.id, l]))
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif text-ink">Landers</h1>
        <Link
          href="/agency/locations"
          className="px-4 py-2 bg-ink text-cream text-sm font-medium rounded-full hover:bg-ink/90 no-underline"
        >
          Create from Locations
        </Link>
      </div>

      {landers.length === 0 ? (
        <div className="border border-warm-border rounded-xl p-8 text-center">
          <p className="text-sm text-warm-gray">
            No landers have been created yet. Select locations from{' '}
            <Link href="/agency/locations" className="text-ink underline">All Locations</Link>{' '}
            and use "Create Landers" to get started.
          </p>
        </div>
      ) : (
        <div className="border border-warm-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-warm-light">
              <tr>
                <th className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium">
                  Location
                </th>
                <th className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium">
                  Organization
                </th>
                <th className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium">
                  Slug
                </th>
                <th className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium">
                  Status
                </th>
                <th className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium">
                </th>
              </tr>
            </thead>
            <tbody className="bg-cream">
              {landers.map((lander: any) => {
                const location = locationMap.get(lander.location_id)
                const org = orgMap.get(lander.org_id)
                return (
                  <tr key={lander.id} className="border-b border-warm-border/50 hover:bg-warm-light/50">
                    <td className="px-5 py-3">
                      <div className="text-sm font-medium text-ink">
                        {location?.name || 'Unknown'}
                      </div>
                      {location?.city && (
                        <div className="text-xs text-warm-gray">{location.city}, {location.state}</div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-warm-gray">
                      {org?.name || 'Unknown'}
                    </td>
                    <td className="px-5 py-3">
                      <Link
                        href={`/l/${lander.slug}`}
                        className="text-xs font-mono text-warm-gray hover:text-ink"
                        target="_blank"
                      >
                        /l/{lander.slug}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      {lander.active ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {org && location && (
                        <Link
                          href={`/admin/${org.slug}/locations/${lander.location_id}/lander`}
                          className="text-xs text-warm-gray hover:text-ink no-underline"
                        >
                          Edit
                        </Link>
                      )}
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
