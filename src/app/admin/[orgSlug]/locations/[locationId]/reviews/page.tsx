import { getOrgBySlug } from '@/lib/org'
import { getLocation, checkAgencyAdmin } from '@/lib/locations'
import { getLocationReviews, getLocationReviewStats } from '@/lib/reviews'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ReviewList } from '@/components/review-list'

export const dynamic = 'force-dynamic'

export default async function LocationReviewsPage({
  params,
  searchParams,
}: {
  params: { orgSlug: string; locationId: string }
  searchParams: { platform?: string; status?: string; rating?: string }
}) {
  const org = await getOrgBySlug(params.orgSlug)
  const location = await getLocation(params.locationId, org.id)
  if (!location) notFound()

  const basePath = `/admin/${params.orgSlug}/locations/${params.locationId}`
  const isAdmin = await checkAgencyAdmin()

  const sourceStats = await getLocationReviewStats(location.id)

  const totalReviews = sourceStats.reduce((sum, s) => sum + (s.total_reviews || 0), 0)
  const avgRating = sourceStats.length > 0
    ? sourceStats.reduce((sum, s) => sum + (s.avg_rating || 0), 0) / sourceStats.length
    : null
  const unreadCount = sourceStats.reduce((sum, s) => sum + (s.unread_count || 0), 0)
  const reviews7d = sourceStats.reduce((sum, s) => sum + (s.reviews_7d || 0), 0)

  const maxRating = searchParams.rating ? parseInt(searchParams.rating) : undefined
  const { reviews, count } = await getLocationReviews(location.id, {
    platform: searchParams.platform,
    status: searchParams.status,
    maxRating,
    limit: 10,
  })

  const statCards = [
    { label: 'Total Reviews', value: totalReviews },
    { label: 'Avg Rating', value: avgRating ? `${avgRating.toFixed(1)}★` : '—' },
    { label: 'New (7d)', value: reviews7d },
    { label: 'Unread', value: unreadCount },
  ]

  return (
    <div>
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
            <Link
              href={basePath}
              className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
            >
              {location.name}
            </Link>
            <span className="text-xs text-warm-gray">/</span>
          </div>
          <h1 className="text-2xl font-serif text-ink">Reviews</h1>
        </div>
        {isAdmin && (
          <Link
            href={`${basePath}/reviews/autopilot`}
            className="px-4 py-1.5 border border-warm-border text-warm-gray text-xs rounded-full hover:text-ink hover:border-ink no-underline transition-colors"
          >
            Configure autopilot
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {statCards.map((s) => (
          <div key={s.label} className="bg-ink rounded-xl p-5">
            <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">{s.label}</div>
            <div className="text-2xl font-bold font-mono text-cream">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Sources */}
      {sourceStats.length > 0 && (
        <div className="flex items-center gap-3 mb-6">
          {sourceStats.map((s) => (
            <div
              key={s.source_id}
              className="flex items-center gap-2 px-3 py-1.5 border border-warm-border rounded-full text-xs"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${
                s.sync_status === 'active' ? 'bg-emerald-500' : 'bg-warm-border'
              }`} />
              <span className="text-ink font-medium capitalize">{s.platform}</span>
              <span className="text-warm-gray">{s.total_reviews} reviews</span>
              {s.avg_rating && (
                <span className="text-warm-gray">{s.avg_rating}★</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 mb-6">
        <Link
          href={`${basePath}/reviews`}
          className={`px-3 py-1 rounded-full text-xs no-underline transition-colors ${
            !searchParams.status && !searchParams.rating
              ? 'bg-ink text-cream'
              : 'border border-warm-border text-warm-gray hover:text-ink'
          }`}
        >
          All ({count})
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
          href={`${basePath}/reviews?rating=2`}
          className={`px-3 py-1 rounded-full text-xs no-underline transition-colors ${
            searchParams.rating === '2'
              ? 'bg-red-800 text-cream'
              : 'border border-warm-border text-warm-gray hover:text-ink'
          }`}
        >
          Negative (1-2★)
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

      {/* Reviews list */}
      {reviews.length === 0 ? (
        <div className="border border-warm-border rounded-xl p-12 text-center text-warm-gray text-sm">
          {totalReviews === 0
            ? 'No review sources connected yet. Connect Google Business Profile from Agency Integrations to start syncing reviews.'
            : 'No reviews match the current filters.'}
        </div>
      ) : (
        <ReviewList
          initialReviews={reviews}
          totalCount={count}
          locationIds={[location.id]}
          filters={{ platform: searchParams.platform, status: searchParams.status, maxRating }}
          canReply
        />
      )}
    </div>
  )
}
