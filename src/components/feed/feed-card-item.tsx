'use client'

import { useState } from 'react'

// Reuse the same WorkItem shape from the API
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WorkItem = any

interface FeedCardItemProps {
  item: WorkItem
  actionLoading: string | null
  onApprove: (item: WorkItem) => Promise<void>
  onReject: (item: WorkItem) => Promise<void>
  onEdit: (item: WorkItem, text: string) => Promise<void>
  onRegenerate?: (item: WorkItem) => Promise<void>
  onDismiss?: (item: WorkItem) => Promise<void>
}

const FIELD_LABELS: Record<string, string> = {
  description: 'Business Description',
  categories: 'Additional Categories',
  attributes: 'Business Attributes',
  hours: 'Business Hours',
}

export function FeedCardItem({
  item,
  actionLoading,
  onApprove,
  onReject,
  onEdit,
  onRegenerate,
  onDismiss,
}: FeedCardItemProps) {
  const [editMode, setEditMode] = useState(false)
  const [editText, setEditText] = useState('')
  const isLoading = actionLoading === item.id

  // Review item (ai_draft_review or review_reply)
  if ((item.type === 'ai_draft_review' || item.type === 'review_reply') && item.review) {
    const review = item.review
    const hasDraft = !!review.ai_draft

    return (
      <div className="border border-warm-border/50 rounded-lg p-4">
        {/* Review header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-ink">
                {review.reviewer_name || 'Anonymous'}
              </span>
              {review.rating !== null && (
                <span className="text-xs text-warm-gray">{renderStars(review.rating)}</span>
              )}
            </div>
            <div className="text-[11px] text-warm-gray mt-0.5">
              {item.location_name} · {timeAgo(review.published_at)}
            </div>
          </div>
          {review.sentiment === 'negative' && (
            <span className="shrink-0 text-[10px] font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
              Negative
            </span>
          )}
        </div>

        {/* Review body */}
        {review.body && (
          <div className="text-xs text-ink/70 mb-3 line-clamp-3">{review.body}</div>
        )}

        {/* AI Draft */}
        {hasDraft && !editMode && (
          <div className="bg-amber-50/50 border border-amber-200/50 rounded-lg p-3 mb-3">
            <div className="text-[10px] text-amber-700 font-medium mb-1">AI Draft</div>
            <div className="text-xs text-ink/80">{review.ai_draft}</div>
          </div>
        )}

        {/* Edit mode */}
        {editMode && (
          <div className="mb-3">
            <textarea
              value={editText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditText(e.target.value)}
              className="w-full text-xs border border-warm-border rounded-lg p-3 resize-none focus:outline-none focus:ring-1 focus:ring-ink/20"
              rows={4}
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={async () => {
                  await onEdit(item, editText)
                  setEditMode(false)
                }}
                disabled={!editText.trim() || isLoading}
                className="px-3 py-1.5 text-xs font-medium bg-ink text-white rounded-full hover:bg-ink/90 disabled:opacity-50 transition-colors"
              >
                Send
              </button>
              <button
                onClick={() => { setEditMode(false); setEditText('') }}
                className="px-3 py-1.5 text-xs text-warm-gray hover:text-ink transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        {!editMode && (
          <div className="flex items-center gap-2">
            {hasDraft && (
              <button
                onClick={() => onApprove(item)}
                disabled={isLoading}
                className="px-3 py-1.5 text-xs font-medium bg-ink text-white rounded-full hover:bg-ink/90 disabled:opacity-50 transition-colors"
              >
                {isLoading ? 'Sending...' : 'Approve'}
              </button>
            )}
            <button
              onClick={() => {
                setEditText(review.ai_draft || '')
                setEditMode(true)
              }}
              className="px-3 py-1.5 text-xs text-warm-gray hover:text-ink transition-colors"
            >
              Edit
            </button>
            {onRegenerate && hasDraft && (
              <button
                onClick={() => onRegenerate(item)}
                className="px-3 py-1.5 text-xs text-warm-gray hover:text-ink transition-colors"
              >
                Regenerate
              </button>
            )}
            <button
              onClick={() => onReject(item)}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs text-red-500 hover:text-red-700 transition-colors ml-auto"
            >
              {hasDraft ? 'Reject' : 'Skip'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // Post item
  if (item.type === 'post_pending' && item.post) {
    const post = item.post
    const isDraft = post.status === 'draft'
    const statusLabels: Record<string, string> = {
      draft: 'Draft', client_review: 'Client Review', pending: 'Approved',
    }

    return (
      <div className="border border-warm-border/50 rounded-lg p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-ink">{item.location_name}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                isDraft ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
              }`}>
                {statusLabels[post.status] || post.status}
              </span>
              {post.source === 'ai' && (
                <span className="text-[10px] text-violet-600 font-medium">AI</span>
              )}
            </div>
            {post.scheduled_for && (
              <div className="text-[11px] text-warm-gray mt-0.5">
                Scheduled {new Date(post.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </div>
            )}
          </div>
        </div>

        {!editMode && (
          <div className="text-xs text-ink/70 mb-3">{post.summary}</div>
        )}

        {editMode && (
          <div className="mb-3">
            <textarea
              value={editText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditText(e.target.value)}
              className="w-full text-xs border border-warm-border rounded-lg p-3 resize-none focus:outline-none focus:ring-1 focus:ring-ink/20"
              rows={4}
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={async () => {
                  await onEdit(item, editText)
                  setEditMode(false)
                }}
                disabled={!editText.trim() || isLoading}
                className="px-3 py-1.5 text-xs font-medium bg-ink text-white rounded-full hover:bg-ink/90 disabled:opacity-50 transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => { setEditMode(false); setEditText('') }}
                className="px-3 py-1.5 text-xs text-warm-gray hover:text-ink transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {!editMode && (
          <div className="flex items-center gap-2">
            {isDraft && (
              <button
                onClick={() => onApprove(item)}
                disabled={isLoading}
                className="px-3 py-1.5 text-xs font-medium bg-ink text-white rounded-full hover:bg-ink/90 disabled:opacity-50 transition-colors"
              >
                {isLoading ? 'Approving...' : 'Approve'}
              </button>
            )}
            <button
              onClick={() => { setEditText(post.summary); setEditMode(true) }}
              className="px-3 py-1.5 text-xs text-warm-gray hover:text-ink transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => onReject(item)}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs text-red-500 hover:text-red-700 transition-colors ml-auto"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    )
  }

  // Google update
  if (item.type === 'google_update') {
    return (
      <div className="border border-warm-border/50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium text-ink">{item.location_name}</span>
          <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Google Update</span>
        </div>
        <div className="text-xs text-ink/70 mb-3">Google has suggested changes to this profile.</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onApprove(item)}
            disabled={isLoading}
            className="px-3 py-1.5 text-xs font-medium bg-ink text-white rounded-full hover:bg-ink/90 disabled:opacity-50 transition-colors"
          >
            Accept
          </button>
          <button
            onClick={() => onReject(item)}
            disabled={isLoading}
            className="px-3 py-1.5 text-xs text-red-500 hover:text-red-700 transition-colors"
          >
            Reject
          </button>
        </div>
      </div>
    )
  }

  // Profile optimization
  if (item.type === 'profile_optimization' && item.profile_optimization) {
    const recs = item.profile_optimization.recommendations || []
    return (
      <div className="border border-warm-border/50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-medium text-ink">{item.location_name}</span>
          <span className="text-[10px] text-violet-600 font-medium">AI</span>
        </div>
        <div className="space-y-3 mb-3">
          {recs.map((rec: { id: string; field: string; current_value: unknown; proposed_value: unknown; edited_value: unknown; ai_rationale: string | null; requires_client_approval: boolean }) => (
            <div key={rec.id} className="bg-warm-light/50 border border-warm-border/50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-ink">
                  {FIELD_LABELS[rec.field] || rec.field}
                </span>
                {rec.requires_client_approval && (
                  <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Needs client approval</span>
                )}
              </div>
              {rec.ai_rationale && (
                <p className="text-[11px] text-warm-gray mb-2">{rec.ai_rationale}</p>
              )}
              {rec.field === 'description' && (
                <div className="space-y-2">
                  {rec.current_value != null && (
                    <div>
                      <div className="text-[10px] text-warm-gray uppercase tracking-wider mb-0.5">Current</div>
                      <p className="text-xs text-ink/50 leading-relaxed line-clamp-3">{String(rec.current_value)}</p>
                    </div>
                  )}
                  <div>
                    <div className="text-[10px] text-emerald-600 uppercase tracking-wider mb-0.5">Proposed</div>
                    <p className="text-xs text-ink leading-relaxed">{String(rec.edited_value || rec.proposed_value)}</p>
                  </div>
                </div>
              )}
              {rec.field === 'categories' && (
                <div>
                  <div className="text-[10px] text-emerald-600 uppercase tracking-wider mb-1">Suggested</div>
                  <div className="flex flex-wrap gap-1">
                    {(Array.isArray(rec.proposed_value) ? rec.proposed_value : []).map((cat: string, i: number) => (
                      <span key={i} className="text-[11px] border border-warm-border rounded-full px-2 py-0.5 text-ink">
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {rec.field === 'attributes' && rec.proposed_value != null && (
                <div>
                  <div className="text-[10px] text-emerald-600 uppercase tracking-wider mb-0.5">Proposed</div>
                  <p className="text-xs text-ink">{typeof rec.proposed_value === 'string' ? rec.proposed_value : JSON.stringify(rec.proposed_value)}</p>
                </div>
              )}
              {rec.field === 'hours' && (
                <p className="text-xs text-warm-gray">Business hours need to be set manually.</p>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onApprove(item)}
            disabled={isLoading}
            className="px-3 py-1.5 text-xs font-medium bg-ink text-white rounded-full hover:bg-ink/90 disabled:opacity-50 transition-colors"
          >
            Approve All
          </button>
          <button
            onClick={() => onReject(item)}
            disabled={isLoading}
            className="px-3 py-1.5 text-xs text-red-500 hover:text-red-700 transition-colors"
          >
            Reject All
          </button>
        </div>
      </div>
    )
  }

  // Sync error
  if (item.type === 'sync_error' && item.sync_error) {
    return (
      <div className="border border-warm-border/50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium text-ink">{item.location_name}</span>
          <span className="text-[10px] text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
            {item.sync_error.platform} error
          </span>
        </div>
        <div className="text-xs text-red-500 mb-3">
          {item.sync_error.sync_error || 'Sync failed'}
        </div>
        {onDismiss && (
          <button
            onClick={() => onDismiss(item)}
            className="px-3 py-1.5 text-xs text-warm-gray hover:text-ink transition-colors"
          >
            Dismiss
          </button>
        )}
      </div>
    )
  }

  // Stale lander
  if (item.type === 'stale_lander' && item.stale_lander) {
    return (
      <div className="border border-warm-border/50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium text-ink">{item.location_name}</span>
          <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Stale</span>
        </div>
        <div className="text-xs text-warm-gray mb-3">
          /l/{item.stale_lander.slug} — AI content needs regeneration
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onApprove(item)}
            disabled={isLoading}
            className="px-3 py-1.5 text-xs font-medium bg-ink text-white rounded-full hover:bg-ink/90 disabled:opacity-50 transition-colors"
          >
            Regenerate
          </button>
          {onDismiss && (
            <button
              onClick={() => onDismiss(item)}
              className="px-3 py-1.5 text-xs text-warm-gray hover:text-ink transition-colors"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    )
  }

  // Citation
  if (item.type === 'citation' && item.citation) {
    const cit = item.citation
    const isNotListed = cit.status === 'not_listed'
    const issues: string[] = []
    if (!isNotListed) {
      if (!cit.name_match) issues.push('name')
      if (!cit.address_match) issues.push('address')
      if (!cit.phone_match) issues.push('phone')
    }

    return (
      <div className="border border-warm-border/50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium text-ink">{item.location_name}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${
            isNotListed ? 'text-red-600 bg-red-50' : 'text-teal-600 bg-teal-50'
          }`}>
            {isNotListed ? 'Not Listed' : 'NAP Mismatch'}
          </span>
        </div>
        <div className="text-xs text-ink/70 mb-1 font-medium">{cit.directory_name}</div>
        <div className="text-xs text-warm-gray mb-3">
          {isNotListed
            ? 'Business not found on this directory'
            : `Incorrect ${issues.join(', ')}`}
        </div>
        <div className="flex items-center gap-2">
          {cit.listing_url && (
            <a
              href={cit.listing_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs font-medium border border-warm-border text-ink rounded-full hover:border-ink transition-colors no-underline"
            >
              View Listing
            </a>
          )}
          {onDismiss && (
            <button
              onClick={() => onDismiss(item)}
              className="px-3 py-1.5 text-xs text-warm-gray hover:text-ink transition-colors"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    )
  }

  return null
}

// ─── Helpers ──────────────────────────────────────────────

function renderStars(rating: number) {
  return Array.from({ length: 5 }, (_, i) => i < rating ? '\u2605' : '\u2606').join('')
}

function timeAgo(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
