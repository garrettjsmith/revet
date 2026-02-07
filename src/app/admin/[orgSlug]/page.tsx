import { createServerSupabase } from '@/lib/supabase/server'
import { getOrgBySlug } from '@/lib/org'
import { getOrgLocations } from '@/lib/locations'
import Link from 'next/link'
import type { ProfileStats } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function OrgDashboard({ params }: { params: { orgSlug: string } }) {
  const org = await getOrgBySlug(params.orgSlug)
  const supabase = createServerSupabase()
  const locations = await getOrgLocations(org.id)

  const { data: stats } = await supabase
    .from('profile_stats')
    .select('*')
    .eq('org_id', org.id)
    .returns<ProfileStats[]>()

  const profiles = stats || []

  const totals = profiles.reduce(
    (acc, p) => ({
      views: acc.views + (p.total_views || 0),
      ratings: acc.ratings + (p.total_ratings || 0),
      google: acc.google + (p.google_clicks || 0),
      email: acc.email + (p.email_clicks || 0),
    }),
    { views: 0, ratings: 0, google: 0, email: 0 }
  )

  const statCards = [
    { label: 'Total Page Views', value: totals.views },
    { label: 'Ratings Submitted', value: totals.ratings },
    { label: 'Google Reviews', value: totals.google },
    { label: 'Manager Emails', value: totals.email },
  ]

  // Group stats by location for the breakdown
  const locationStats = locations.map((loc) => {
    const locProfiles = profiles.filter((p) => p.location_id === loc.id)
    return {
      location: loc,
      views7d: locProfiles.reduce((sum, p) => sum + (p.views_7d || 0), 0),
      google7d: locProfiles.reduce((sum, p) => sum + (p.google_clicks_7d || 0), 0),
      emails7d: locProfiles.reduce((sum, p) => sum + (p.email_clicks_7d || 0), 0),
      funnelCount: locProfiles.length,
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
      <div className="border border-warm-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-warm-border">
          <h2 className="text-sm font-semibold text-ink">Locations</h2>
        </div>
        {locationStats.length === 0 ? (
          <div className="p-12 text-center text-warm-gray text-sm">
            No locations yet.{' '}
            <Link href={`${basePath}/locations/new`} className="text-ink underline hover:no-underline">
              Add your first location
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-warm-border">
                {['Location', 'Type', 'Funnels', 'Views (7d)', 'Google (7d)', 'Emails (7d)', ''].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {locationStats.map(({ location: loc, views7d, google7d, emails7d, funnelCount }) => (
                <tr key={loc.id} className="border-b border-warm-border/50 hover:bg-warm-light/50">
                  <td className="px-5 py-3.5">
                    <div className="text-sm font-medium text-ink">{loc.name}</div>
                    {loc.city && loc.state && (
                      <div className="text-xs text-warm-gray mt-0.5">{loc.city}, {loc.state}</div>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-warm-gray capitalize">{loc.type.replace('_', ' ')}</td>
                  <td className="px-5 py-3.5 font-mono text-sm text-ink">{funnelCount}</td>
                  <td className="px-5 py-3.5 font-mono text-sm text-ink">{views7d}</td>
                  <td className="px-5 py-3.5 font-mono text-sm text-ink">{google7d}</td>
                  <td className="px-5 py-3.5 font-mono text-sm text-ink">{emails7d}</td>
                  <td className="px-5 py-3.5">
                    <Link
                      href={`${basePath}/locations/${loc.id}`}
                      className="text-xs text-warm-gray hover:text-ink no-underline"
                    >
                      View
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
