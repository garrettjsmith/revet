'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const router = useRouter()
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

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const toggleAll = () => {
    if (selectedIds.size === reviews.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(reviews.map((r) => r.id)))
    }
  }

  const handleBulkReply = async () => {
    if (!replyText.trim() || selectedIds.size === 0) return
    setSending(true)

    const res = await fetch('/api/reviews/bulk-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        review_ids: Array.from(selectedIds),
        reply_body: replyText.trim(),
      }),
    })

    if (res.ok) {
      setSelectedIds(new Set())
      setReplyText('')
      router.refresh()
    }
    setSending(false)
  }

  if (reviews.length === 0) {
    return null
  }

  const someSelected = selectedIds.size > 0

  return (
    <div>
      {/* Select all */}
      {canReply && (
        <div className="flex items-center gap-2 mb-3">
          <input
            type="checkbox"
            checked={selectedIds.size === reviews.length && reviews.length > 0}
            onChange={toggleAll}
            className="accent-ink"
          />
          <span className="text-xs text-warm-gray">
            {someSelected ? `${selectedIds.size} selected` : 'Select all'}
          </span>
        </div>
      )}

      <div className="space-y-4">
        {reviews.map((review) => (
          <div key={review.id} className={canReply ? 'flex gap-3' : ''}>
            {canReply && (
              <div className="pt-5 shrink-0">
                <input
                  type="checkbox"
                  checked={selectedIds.has(review.id)}
                  onChange={() => toggleSelect(review.id)}
                  className="accent-ink"
                />
              </div>
            )}
            <div className={canReply ? 'flex-1 min-w-0' : ''}>
              <ReviewCard
                review={review}
                showLocation={showLocation}
                canReply={canReply}
              />
            </div>
          </div>
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

      {/* Bulk reply bar */}
      {someSelected && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-ink text-cream rounded-2xl shadow-xl px-5 py-4 w-[calc(100%-3rem)] max-w-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">
              Reply to {selectedIds.size} review{selectedIds.size !== 1 ? 's' : ''}
            </span>
            <button
              onClick={() => { setSelectedIds(new Set()); setReplyText('') }}
              className="text-xs text-cream/60 hover:text-cream transition-colors"
            >
              Clear
            </button>
          </div>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write your reply..."
            rows={3}
            className="w-full px-3 py-2 bg-cream/10 border border-cream/20 rounded-lg text-sm text-cream outline-none placeholder:text-cream/30 resize-y"
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={handleBulkReply}
              disabled={sending || !replyText.trim()}
              className="px-4 py-1.5 bg-cream hover:bg-cream/90 text-ink text-xs font-medium rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sending ? 'Sending...' : 'Send replies'}
            </button>
            <span className="text-[10px] text-cream/50">
              Google reviews post via API
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
