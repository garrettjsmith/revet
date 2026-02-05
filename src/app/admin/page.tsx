import { createServerSupabase } from '@/lib/supabase/server'
import Link from 'next/link'
import type { ProfileStats } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function AdminDashboard() {
  const supabase = createServerSupabase()

  const { data: stats } = await supabase
    .from('profile_stats')
    .select('*')
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
    { label: 'Total Page Views', value: totals.views, color: 'text-sky-400' },
    { label: 'Ratings Submitted', value: totals.ratings, color: 'text-amber-400' },
    { label: 'Google Reviews', value: totals.google, color: 'text-green-400' },
    { label: 'Manager Emails', value: totals.email, color: 'text-red-400' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-semibold text-white">Dashboard</h1>
        <Link
          href="/admin/profiles/new"
          className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold rounded-lg no-underline transition-colors"
        >
          + New Review Funnel
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {statCards.map((s) => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">{s.label}</div>
            <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Profiles table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Active Review Funnels</h2>
        </div>
        {profiles.length === 0 ? (
          <div className="p-12 text-center text-gray-500 text-sm">
            No profiles yet.{' '}
            <Link href="/admin/profiles/new" className="text-sky-400 hover:underline">
              Create your first review funnel
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                {['Profile', 'URL', 'Views (7d)', 'Google (7d)', 'Emails (7d)', 'Avg Rating', ''].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-gray-500 uppercase tracking-wider font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.profile_id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-5 py-3.5">
                    <div className="text-sm font-medium text-white">{p.profile_name}</div>
                    <div className="text-xs text-gray-500">{p.org_name}</div>
                  </td>
                  <td className="px-5 py-3.5">
                    <code className="text-xs text-sky-400 font-mono">/r/{p.slug}</code>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-sm text-gray-300">{p.views_7d}</td>
                  <td className="px-5 py-3.5 font-mono text-sm text-green-400">{p.google_clicks_7d}</td>
                  <td className="px-5 py-3.5 font-mono text-sm text-red-400">{p.email_clicks_7d}</td>
                  <td className="px-5 py-3.5 font-mono text-sm text-amber-400">
                    {p.avg_rating ? `${p.avg_rating}★` : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/admin/profiles/${p.profile_id}`}
                      className="text-xs text-gray-400 hover:text-white no-underline"
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
