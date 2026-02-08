import { getOrgBySlug } from '@/lib/org'
import { getOrgReviews } from '@/lib/reviews'
import { createServerSupabase } from '@/lib/supabase/server'
import Link from 'next/link'
import { ReviewList } from '@/components/review-list'

export const dynamic = 'force-dynamic'

export default async function OrgReviewsPage({
  params,
  searchParams,
}: {
  params: { orgSlug: string }
  searchParams: { platform?: string; status?: string }
}) {
  const org = await getOrgBySlug(params.orgSlug)
  const supabase = createServerSupabase()

  const { data: locations } = await supabase
    .from('locations')
    .select('id')
    .eq('org_id', org.id)

  const locationIds = (locations || []).map((l: { id: string }) => l.id)

  let totalReviews = 0
  let unreadCount = 0
  let avgRating: number | null = null

  if (locationIds.length > 0) {
    const { data: stats } = await supabase
      .from('review_source_stats')
      .select('*')
      .in('location_id', locationIds)

    if (stats && stats.length > 0) {
      totalReviews = stats.reduce((sum: number, s: any) => sum + (s.total_reviews || 0), 0)
      unreadCount = stats.reduce((sum: number, s: any) => sum + (s.unread_count || 0), 0)
      const ratings = stats.filter((s: any) => s.avg_rating !== null)
      avgRating = ratings.length > 0
        ? ratings.reduce((sum: number, s: any) => sum + s.avg_rating, 0) / ratings.length
        : null
    }
  }

  const { reviews, count } = await getOrgReviews(org.id, {
    platform: searchParams.platform,
    status: searchParams.status,
    limit: 10,
  })

  const basePath = `/admin/${params.orgSlug}`

  const statCards = [
    { label: 'Total Reviews', value: totalReviews },
    { label: 'Avg Rating', value: avgRating ? `${avgRating.toFixed(1)}★` : '—' },
    { label: 'Unread', value: unreadCount },
    { label: 'Locations', value: locationIds.length },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif text-ink">Reviews</h1>
        <span className="text-xs text-warm-gray">
          {count} review{count !== 1 ? 's' : ''} across {locationIds.length} location{locationIds.length !== 1 ? 's' : ''}
        </span>
      </div>

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
          href={`${basePath}/reviews`}
          className={`px-3 py-1 rounded-full text-xs no-underline transition-colors ${
            !searchParams.status
              ? 'bg-ink text-cream'
              : 'border border-warm-border text-warm-gray hover:text-ink'
          }`}
        >
          All
        </Link>
        <Link
          href={`${basePath}/reviews?status=new`}
          className={`px-3 py-1 rounded-full text-xs no-underline transition-colors ${
            searchParams.status === 'new'
              ? 'bg-ink text-cream'
              : 'border border-warm-border text-warm-gray hover:text-ink'
          }`}
        >
          Unread
        </Link>
        <Link
          href={`${basePath}/reviews?status=flagged`}
          className={`px-3 py-1 rounded-full text-xs no-underline transition-colors ${
            searchParams.status === 'flagged'
              ? 'bg-amber-700 text-cream'
              : 'border border-warm-border text-warm-gray hover:text-ink'
          }`}
        >
          Flagged
        </Link>
      </div>

      {reviews.length === 0 ? (
        <div className="border border-warm-border rounded-xl p-12 text-center text-warm-gray text-sm">
          No reviews yet. Connect Google Business Profile from Agency Integrations to start syncing.
        </div>
      ) : (
        <ReviewList
          initialReviews={reviews}
          totalCount={count}
          locationIds={locationIds}
          filters={{ platform: searchParams.platform, status: searchParams.status }}
          showLocation
          canReply
        />
      )}
    </div>
  )
}
