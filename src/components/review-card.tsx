'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Review } from '@/lib/types'

const PLATFORM_LABELS: Record<string, string> = {
  google: 'Google',
  healthgrades: 'Healthgrades',
  yelp: 'Yelp',
  facebook: 'Facebook',
  vitals: 'Vitals',
  zocdoc: 'Zocdoc',
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: 'New', color: 'text-blue-600', bg: 'bg-blue-500' },
  seen: { label: 'Seen', color: 'text-warm-gray', bg: 'bg-warm-border' },
  flagged: { label: 'Flagged', color: 'text-amber-600', bg: 'bg-amber-500' },
  responded: { label: 'Responded', color: 'text-emerald-600', bg: 'bg-emerald-500' },
  archived: { label: 'Archived', color: 'text-warm-gray/50', bg: 'bg-warm-border/50' },
}

interface ReviewCardProps {
  review: Review
  showLocation?: boolean
  canReply?: boolean
}

export function ReviewCard({ review, showLocation, canReply }: ReviewCardProps) {
  const [showReply, setShowReply] = useState(false)
  const [replyText, setReplyText] = useState(review.reply_body || '')
  const [saving, setSaving] = useState(false)
  const [notes, setNotes] = useState(review.internal_notes || '')
  const [showNotes, setShowNotes] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  const statusConfig = STATUS_CONFIG[review.status] || STATUS_CONFIG.new
  const platform = PLATFORM_LABELS[review.platform] || review.platform
  const isNegative = review.rating !== null && review.rating <= 2
  const isGoogle = review.platform === 'google'

  const handleStatusChange = async (newStatus: string) => {
    await supabase
      .from('reviews')
      .update({ status: newStatus })
      .eq('id', review.id)
    router.refresh()
  }

  const handleSaveReply = async () => {
    setSaving(true)
    await supabase
      .from('reviews')
      .update({
        reply_body: replyText,
        replied_via: 'manual',
        status: 'responded',
      })
      .eq('id', review.id)
    setSaving(false)
    setShowReply(false)
    router.refresh()
  }

  const handleSaveNotes = async () => {
    await supabase
      .from('reviews')
      .update({ internal_notes: notes })
      .eq('id', review.id)
    setShowNotes(false)
    router.refresh()
  }

  const publishedDate = new Date(review.published_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className={`border rounded-xl p-5 ${
      isNegative ? 'border-red-200 bg-red-50/30' : 'border-warm-border'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {review.reviewer_photo_url ? (
            <img
              src={review.reviewer_photo_url}
              alt=""
              className="w-9 h-9 rounded-full object-cover"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-ink flex items-center justify-center text-cream text-xs font-bold font-mono shrink-0">
              {(review.reviewer_name || 'A')[0].toUpperCase()}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-ink">
                {review.reviewer_name || 'Anonymous'}
              </span>
              {showLocation && review.location_name && (
                <span className="text-xs text-warm-gray">
                  · {review.location_name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-warm-gray font-mono">{platform}</span>
              <span className="text-warm-border">·</span>
              <span className="text-[10px] text-warm-gray">{publishedDate}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {review.rating !== null && (
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  className={`text-sm ${star <= review.rating! ? 'text-amber-400' : 'text-warm-border'}`}
                >
                  ★
                </span>
              ))}
            </div>
          )}
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${statusConfig.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.bg}`} />
            {statusConfig.label}
          </span>
        </div>
      </div>

      {/* Review body */}
      {review.body && (
        <p className="text-sm text-ink leading-relaxed mb-3">{review.body}</p>
      )}

      {/* Existing reply */}
      {review.reply_body && !showReply && (
        <div className="bg-warm-light rounded-lg p-3 mb-3 border-l-2 border-ink">
          <div className="text-[10px] text-warm-gray uppercase tracking-wider mb-1">
            Reply {review.replied_via === 'api' ? '(via API)' : ''}
          </div>
          <p className="text-xs text-ink leading-relaxed">{review.reply_body}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {review.status === 'new' && (
          <button
            onClick={() => handleStatusChange('seen')}
            className="text-[10px] text-warm-gray hover:text-ink transition-colors"
          >
            Mark seen
          </button>
        )}
        {review.status !== 'flagged' && (
          <button
            onClick={() => handleStatusChange('flagged')}
            className="text-[10px] text-warm-gray hover:text-amber-600 transition-colors"
          >
            Flag
          </button>
        )}
        {review.status !== 'archived' && (
          <button
            onClick={() => handleStatusChange('archived')}
            className="text-[10px] text-warm-gray hover:text-ink transition-colors"
          >
            Archive
          </button>
        )}

        <span className="text-warm-border">·</span>

        {canReply && isGoogle && (
          <button
            onClick={() => setShowReply(!showReply)}
            className="text-[10px] text-ink font-medium hover:text-ink/70 transition-colors"
          >
            {showReply ? 'Cancel reply' : review.reply_body ? 'Edit reply' : 'Reply'}
          </button>
        )}
        {canReply && !isGoogle && (
          <span className="text-[10px] text-warm-gray/50 italic">
            Reply on {platform}
          </span>
        )}

        <button
          onClick={() => setShowNotes(!showNotes)}
          className="text-[10px] text-warm-gray hover:text-ink transition-colors ml-auto"
        >
          {showNotes ? 'Close notes' : review.internal_notes ? 'View notes' : 'Add note'}
        </button>
      </div>

      {/* Reply composer */}
      {showReply && (
        <div className="mt-3 border-t border-warm-border pt-3">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write your reply..."
            rows={3}
            className="w-full px-3 py-2 border border-warm-border rounded-lg text-sm text-ink outline-none focus:ring-2 focus:ring-ink/20 resize-y placeholder:text-warm-gray"
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={handleSaveReply}
              disabled={saving || !replyText.trim()}
              className="px-4 py-1.5 bg-ink hover:bg-ink/90 text-cream text-xs font-medium rounded-full transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Reply'}
            </button>
            <span className="text-[10px] text-warm-gray">
              {isGoogle ? 'Will be posted via Google API when connected' : 'Saved for reference only'}
            </span>
          </div>
        </div>
      )}

      {/* Internal notes */}
      {showNotes && (
        <div className="mt-3 border-t border-warm-border pt-3">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Internal notes (not visible to reviewers)..."
            rows={2}
            className="w-full px-3 py-2 border border-warm-border rounded-lg text-sm text-ink outline-none focus:ring-2 focus:ring-ink/20 resize-y placeholder:text-warm-gray"
          />
          <button
            onClick={handleSaveNotes}
            className="mt-2 px-4 py-1.5 border border-warm-border text-warm-gray text-xs rounded-full hover:text-ink hover:border-ink transition-colors"
          >
            Save Notes
          </button>
        </div>
      )}
    </div>
  )
}
