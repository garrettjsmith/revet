import { createServerSupabase } from '@/lib/supabase/server'
import { getOrgBySlug } from '@/lib/org'
import Link from 'next/link'
import type { ProfileStats } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function OrgDashboard({ params }: { params: { orgSlug: string } }) {
  const org = await getOrgBySlug(params.orgSlug)
  const supabase = createServerSupabase()

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

  const basePath = `/admin/${params.orgSlug}`

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-serif text-ink">Dashboard</h1>
        <Link
          href={`${basePath}/review-funnels/new`}
          className="px-5 py-2 bg-ink hover:bg-ink/90 text-cream text-sm font-medium rounded-full no-underline transition-colors"
        >
          + New Review Funnel
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

      {/* Profiles table */}
      <div className="border border-warm-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-warm-border">
          <h2 className="text-sm font-semibold text-ink">Active Review Funnels</h2>
        </div>
        {profiles.length === 0 ? (
          <div className="p-12 text-center text-warm-gray text-sm">
            No profiles yet.{' '}
            <Link href={`${basePath}/review-funnels/new`} className="text-ink underline hover:no-underline">
              Create your first review funnel
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
