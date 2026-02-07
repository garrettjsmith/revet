import { createServerSupabase } from '@/lib/supabase/server'
import { getOrgBySlug } from '@/lib/org'
import { getLocation } from '@/lib/locations'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { ProfileStats } from '@/lib/types'

export const dynamic = 'force-dynamic'

const TYPE_LABELS: Record<string, string> = {
  place: 'Place',
  practitioner: 'Practitioner',
  service_area: 'Service Area',
}

export default async function LocationDetailPage({
  params,
}: {
  params: { orgSlug: string; locationId: string }
}) {
  const org = await getOrgBySlug(params.orgSlug)
  const location = await getLocation(params.locationId, org.id)
  if (!location) notFound()

  const supabase = createServerSupabase()
  const basePath = `/admin/${params.orgSlug}/locations/${params.locationId}`

  // Get profile stats for this location
  const { data: stats } = await supabase
    .from('profile_stats')
    .select('*')
    .eq('location_id', location.id)
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
    { label: 'Page Views', value: totals.views },
    { label: 'Ratings', value: totals.ratings },
    { label: 'Google Reviews', value: totals.google },
    { label: 'Manager Emails', value: totals.email },
  ]

  return (
    <div>
      {/* Location header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/admin/${params.orgSlug}/locations`}
              className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
            >
              Locations
            </Link>
            <span className="text-xs text-warm-gray">/</span>
          </div>
          <h1 className="text-2xl font-serif text-ink">{location.name}</h1>
          <div className="flex items-center gap-2 mt-1 text-xs text-warm-gray">
            <span>{TYPE_LABELS[location.type]}</span>
            {location.city && location.state && (
              <>
                <span className="text-warm-border">&middot;</span>
                <span>{location.city}, {location.state}</span>
              </>
            )}
            {location.email && (
              <>
                <span className="text-warm-border">&middot;</span>
                <span>{location.email}</span>
              </>
            )}
          </div>
        </div>
        <Link
          href={`${basePath}/settings`}
          className="px-4 py-2 border border-warm-border text-warm-gray text-sm rounded-full hover:text-ink hover:border-ink no-underline transition-colors"
        >
          Edit Location
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

      {/* Review Funnels section */}
      <div className="border border-warm-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-warm-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Review Funnels</h2>
          <Link
            href={`${basePath}/review-funnels/new`}
            className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
          >
            + New Funnel
          </Link>
        </div>
        {profiles.length === 0 ? (
          <div className="p-12 text-center text-warm-gray text-sm">
            No review funnels yet.{' '}
            <Link href={`${basePath}/review-funnels/new`} className="text-ink underline hover:no-underline">
              Create one
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-warm-border">
                {['Profile', 'URL', 'Views (7d)', 'Google (7d)', 'Emails (7d)', 'Avg Rating', ''].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.profile_id} className="border-b border-warm-border/50 hover:bg-warm-light/50">
                  <td className="px-5 py-3.5">
                    <div className="text-sm font-medium text-ink">{p.profile_name}</div>
                  </td>
                  <td className="px-5 py-3.5">
                    <code className="text-xs text-ink font-mono">/r/{p.slug}</code>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-sm text-ink">{p.views_7d}</td>
                  <td className="px-5 py-3.5 font-mono text-sm text-ink">{p.google_clicks_7d}</td>
                  <td className="px-5 py-3.5 font-mono text-sm text-ink">{p.email_clicks_7d}</td>
                  <td className="px-5 py-3.5 font-mono text-sm text-ink">
                    {p.avg_rating ? `${p.avg_rating}★` : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <Link
                      href={`${basePath}/review-funnels/${p.profile_id}`}
                      className="text-xs text-warm-gray hover:text-ink no-underline"
                    >
                      Edit
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
