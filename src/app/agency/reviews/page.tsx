import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import type { Review } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function AgencyReviewsPage({
  searchParams,
}: {
  searchParams: { status?: string; platform?: string; rating?: string }
}) {
  const supabase = createAdminClient()

  const { data: stats } = await supabase
    .from('review_source_stats')
    .select('*')

  const allStats = stats || []
  const totalReviews = allStats.reduce((sum, s: any) => sum + (s.total_reviews || 0), 0)
  const unreadCount = allStats.reduce((sum, s: any) => sum + (s.unread_count || 0), 0)
  const negativeCount = allStats.reduce((sum, s: any) => sum + (s.negative_count || 0), 0)
  const connectedSources = allStats.filter((s: any) => s.sync_status === 'active').length

  let query = supabase
    .from('reviews')
    .select('*, locations(name, org_id, organizations:org_id(name, slug))')
    .order('published_at', { ascending: false })
    .limit(50)

  if (searchParams.status) query = query.eq('status', searchParams.status)
  if (searchParams.platform) query = query.eq('platform', searchParams.platform)
  if (searchParams.rating) query = query.lte('rating', parseInt(searchParams.rating))

  const { data: reviews } = await query

  const reviewList = (reviews || []).map((r: any) => ({
    ...r,
    location_name: r.locations?.name || null,
    org_name: r.locations?.organizations?.name || null,
    org_slug: r.locations?.organizations?.slug || null,
  })) as (Review & { org_name?: string; org_slug?: string })[]

  const statCards = [
    { label: 'Total Reviews', value: totalReviews },
    { label: 'Unread', value: unreadCount },
    { label: 'Negative', value: negativeCount },
    { label: 'Connected Sources', value: connectedSources },
  ]

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-8">Reviews — All Clients</h1>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {statCards.map((s) => (
          <div key={s.label} className="bg-ink rounded-xl p-5">
            <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">{s.label}</div>
            <div className="text-2xl font-bold font-mono text-cream">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/agency/reviews"
          className={`px-3 py-1 rounded-full text-xs no-underline transition-colors ${
            !searchParams.status && !searchParams.rating
              ? 'bg-ink text-cream'
              : 'border border-warm-border text-warm-gray hover:text-ink'
          }`}
        >
          All
        </Link>
        <Link
          href="/agency/reviews?status=new"
          className={`px-3 py-1 rounded-full text-xs no-underline transition-colors ${
            searchParams.status === 'new' && !searchParams.rating
              ? 'bg-ink text-cream'
              : 'border border-warm-border text-warm-gray hover:text-ink'
          }`}
        >
          Unread
        </Link>
        <Link
          href="/agency/reviews?status=new&rating=2"
          className={`px-3 py-1 rounded-full text-xs no-underline transition-colors ${
            searchParams.rating === '2'
              ? 'bg-red-800 text-cream'
              : 'border border-warm-border text-warm-gray hover:text-ink'
          }`}
        >
          Negative (1-2★)
        </Link>
        <Link
          href="/agency/reviews?status=flagged"
          className={`px-3 py-1 rounded-full text-xs no-underline transition-colors ${
            searchParams.status === 'flagged'
              ? 'bg-amber-700 text-cream'
              : 'border border-warm-border text-warm-gray hover:text-ink'
          }`}
        >
          Flagged
        </Link>
      </div>

      {reviewList.length === 0 ? (
        <div className="border border-warm-border rounded-xl p-12 text-center text-warm-gray text-sm">
          No reviews synced yet. Connect Google Business Profile from{' '}
          <Link href="/agency/integrations" className="text-ink underline hover:no-underline">
            Integrations
          </Link>{' '}
          to start.
        </div>
      ) : (
        <div className="border border-warm-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-warm-border">
                {['Review', 'Organization', 'Location', 'Platform', 'Rating', 'Status', 'Date'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reviewList.map((r) => {
                const isNeg = r.rating !== null && r.rating <= 2
                return (
                  <tr key={r.id} className={`border-b border-warm-border/50 ${isNeg ? 'bg-red-50/30' : 'hover:bg-warm-light/50'}`}>
                    <td className="px-5 py-3.5 max-w-[250px]">
                      <div className="text-xs text-ink truncate">
                        {r.body ? `"${r.body.slice(0, 80)}${r.body.length > 80 ? '...' : ''}"` : '—'}
                      </div>
                      <div className="text-[10px] text-warm-gray mt-0.5">
                        {r.reviewer_name || 'Anonymous'}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-warm-gray">
                      {r.org_slug ? (
                        <Link href={`/admin/${r.org_slug}/reviews`} className="text-ink no-underline hover:underline">
                          {r.org_name}
                        </Link>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-warm-gray">
                      {r.location_name || '—'}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-warm-gray capitalize">
                      {r.platform}
                    </td>
                    <td className="px-5 py-3.5">
                      {r.rating !== null ? (
                        <span className={`text-xs font-mono ${isNeg ? 'text-red-600 font-bold' : 'text-ink'}`}>
                          {r.rating}★
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${
                        r.status === 'new' ? 'text-blue-600' :
                        r.status === 'flagged' ? 'text-amber-600' :
                        r.status === 'responded' ? 'text-emerald-600' :
                        'text-warm-gray'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          r.status === 'new' ? 'bg-blue-500' :
                          r.status === 'flagged' ? 'bg-amber-500' :
                          r.status === 'responded' ? 'bg-emerald-500' :
                          'bg-warm-border'
                        }`} />
                        {r.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[10px] text-warm-gray whitespace-nowrap">
                      {new Date(r.published_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
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
