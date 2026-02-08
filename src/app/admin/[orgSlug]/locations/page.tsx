import { getOrgBySlug } from '@/lib/org'
import { getOrgLocations } from '@/lib/locations'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import type { Location } from '@/lib/types'

export const dynamic = 'force-dynamic'

const TYPE_LABELS: Record<string, string> = {
  place: 'Place',
  practitioner: 'Practitioner',
  service_area: 'Service Area',
}

export default async function LocationsPage({ params }: { params: { orgSlug: string } }) {
  const org = await getOrgBySlug(params.orgSlug)
  const locations = await getOrgLocations(org.id)
  const basePath = `/admin/${params.orgSlug}`
  const adminClient = createAdminClient()

  const locationIds = locations.map((l) => l.id)

  // Get review sources for review counts
  const { data: reviewSources } = locationIds.length > 0
    ? await adminClient
        .from('review_sources')
        .select('location_id, total_review_count, average_rating, sync_status')
        .in('location_id', locationIds)
        .eq('platform', 'google')
    : { data: [] }

  // Get GBP profiles for category
  const { data: gbpProfiles } = locationIds.length > 0
    ? await adminClient
        .from('gbp_profiles')
        .select('location_id, primary_category_name, open_status')
        .in('location_id', locationIds)
    : { data: [] }

  const sourceByLocation = new Map((reviewSources || []).map((s) => [s.location_id, s]))
  const profileByLocation = new Map((gbpProfiles || []).map((p) => [p.location_id, p]))

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

      <div className="border border-warm-border rounded-xl overflow-hidden">
        {locations.length === 0 ? (
          <div className="text-center py-16 text-warm-gray text-sm">
            No locations yet. Add your first location to get started.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-warm-border">
                {['Location', 'Type', 'Reviews', 'Rating', 'GBP', ''].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {locations.map((loc: Location) => {
                const source = sourceByLocation.get(loc.id)
                const profile = profileByLocation.get(loc.id)
                return (
                  <tr key={loc.id} className="border-b border-warm-border/50 hover:bg-warm-light/50">
                    <td className="px-5 py-3.5">
                      <Link
                        href={`${basePath}/locations/${loc.id}`}
                        className="text-sm font-medium text-ink no-underline hover:underline"
                      >
                        {loc.name}
                      </Link>
                      <div className="text-xs text-warm-gray mt-0.5 flex items-center gap-2">
                        {loc.city && loc.state && (
                          <span>{loc.city}, {loc.state}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-warm-gray">{TYPE_LABELS[loc.type]}</td>
                    <td className="px-5 py-3.5 font-mono text-sm text-ink">
                      {source?.total_review_count || 0}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-sm text-ink">
                      {source?.average_rating ? `${Number(source.average_rating).toFixed(1)}` : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      {profile ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          {profile.primary_category_name || 'Connected'}
                        </span>
                      ) : source ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-amber-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          Syncing
                        </span>
                      ) : (
                        <span className="text-[10px] text-warm-gray">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <Link
                        href={`${basePath}/locations/${loc.id}`}
                        className="text-xs text-warm-gray hover:text-ink no-underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
