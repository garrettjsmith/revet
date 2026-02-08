'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ReviewCard } from '@/components/review-card'
import type { Review } from '@/lib/types'

const PAGE_SIZE = 10

interface ReviewListProps {
  initialReviews: Review[]
  totalCount: number
  locationIds: string[]
  filters?: { platform?: string; status?: string; maxRating?: number }
  showLocation?: boolean
  canReply?: boolean
}

export function ReviewList({
  initialReviews,
  totalCount,
  locationIds,
  filters,
  showLocation,
  canReply,
}: ReviewListProps) {
  const [reviews, setReviews] = useState<Review[]>(initialReviews)
  const [loading, setLoading] = useState(false)
  const hasMore = reviews.length < totalCount

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return
    setLoading(true)

    const supabase = createClient()
    let query = supabase
      .from('reviews')
      .select(showLocation ? '*, locations(name)' : '*')
      .in('location_id', locationIds)
      .order('published_at', { ascending: false })
      .range(reviews.length, reviews.length + PAGE_SIZE - 1)

    if (filters?.platform) query = query.eq('platform', filters.platform)
    if (filters?.status) query = query.eq('status', filters.status)
    if (filters?.maxRating) query = query.lte('rating', filters.maxRating)

    const { data } = await query

    if (data && data.length > 0) {
      const mapped = showLocation
        ? data.map((r: any) => ({ ...r, location_name: r.locations?.name || null }))
        : data
      setReviews((prev) => [...prev, ...mapped])
    }

    setLoading(false)
  }, [loading, hasMore, reviews.length, locationIds, filters, showLocation])

  if (reviews.length === 0) {
    return null
  }

  return (
    <div>
      <div className="space-y-4">
        {reviews.map((review) => (
          <ReviewCard
            key={review.id}
            review={review}
            showLocation={showLocation}
            canReply={canReply}
          />
        ))}
      </div>

      {hasMore && (
        <div className="mt-6 text-center">
          <button
            onClick={loadMore}
            disabled={loading}
            className="px-6 py-2.5 border border-warm-border text-sm text-warm-gray hover:text-ink hover:border-ink rounded-full transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading...' : `Load more (${reviews.length} of ${totalCount})`}
          </button>
        </div>
      )}
    </div>
  )
}
