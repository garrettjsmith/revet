'use client'

import { useState } from 'react'
import { FeedCardItem } from './feed-card-item'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WorkItem = any

interface FeedGroup {
  group_key: string
  org_id: string
  org_name: string
  org_slug: string
  item_type: string
  priority: 'urgent' | 'important' | 'info'
  item_count: number
  items: WorkItem[]
  created_at: string
}

interface FeedCardProps {
  group: FeedGroup
  actionLoading: string | null
  onApproveItem: (item: WorkItem) => Promise<void>
  onRejectItem: (item: WorkItem) => Promise<void>
  onEditItem: (item: WorkItem, text: string) => Promise<void>
  onRegenerateItem?: (item: WorkItem) => Promise<void>
  onDismissItem?: (item: WorkItem) => Promise<void>
  onApproveAll: (group: FeedGroup) => Promise<void>
  onRejectAll: (group: FeedGroup) => Promise<void>
}

const TYPE_LABELS: Record<string, string> = {
  ai_draft_review: 'Review Replies',
  review_reply: 'Reviews Needing Replies',
  post_pending: 'Posts',
  profile_optimization: 'Profile Optimizations',
  google_update: 'Google Updates',
  sync_error: 'Sync Errors',
  stale_lander: 'Stale Landers',
}

const TYPE_LABEL_SINGULAR: Record<string, string> = {
  ai_draft_review: 'Review Reply',
  review_reply: 'Review Needing Reply',
  post_pending: 'Post',
  profile_optimization: 'Profile Optimization',
  google_update: 'Google Update',
  sync_error: 'Sync Error',
  stale_lander: 'Stale Lander',
}

function getTypeLabel(type: string, count: number) {
  return count === 1 ? (TYPE_LABEL_SINGULAR[type] || type) : (TYPE_LABELS[type] || type)
}

// Types that support "Approve All"
const APPROVABLE_TYPES = new Set(['ai_draft_review', 'post_pending', 'profile_optimization', 'google_update', 'stale_lander'])

function canApproveAll(type: string, items: WorkItem[]): boolean {
  if (!APPROVABLE_TYPES.has(type)) return false
  // Posts: only drafts can be approved
  if (type === 'post_pending') {
    return items.some((i: WorkItem) => i.post?.status === 'draft')
  }
  return items.length > 0
}

function getApprovableCount(type: string, items: WorkItem[]): number {
  if (type === 'post_pending') {
    return items.filter((i: WorkItem) => i.post?.status === 'draft').length
  }
  return items.length
}

export function FeedCard({
  group,
  actionLoading,
  onApproveItem,
  onRejectItem,
  onEditItem,
  onRegenerateItem,
  onDismissItem,
  onApproveAll,
  onRejectAll,
}: FeedCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [approveAllLoading, setApproveAllLoading] = useState(false)
  const [rejectAllLoading, setRejectAllLoading] = useState(false)

  const { items, item_type, priority, org_name } = group
  const count = items.length

  if (count === 0) return null

  const isSingle = count === 1
  const showApproveAll = !isSingle && canApproveAll(item_type, items)
  const approvableCount = getApprovableCount(item_type, items)

  const handleApproveAll = async () => {
    setApproveAllLoading(true)
    await onApproveAll(group)
    setApproveAllLoading(false)
  }

  const handleRejectAll = async () => {
    setRejectAllLoading(true)
    await onRejectAll(group)
    setRejectAllLoading(false)
  }

  const priorityDotColor = priority === 'urgent'
    ? 'bg-red-500'
    : priority === 'important'
      ? 'bg-amber-400'
      : 'bg-warm-border'

  // Preview text for collapsed state
  const previewItems = items.slice(0, 3)

  return (
    <div className="border border-warm-border rounded-xl overflow-hidden">
      {/* Card header — always visible */}
      <div className="px-5 py-4">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`shrink-0 w-2 h-2 rounded-full ${priorityDotColor}`} />
            <span className="text-sm font-medium text-ink truncate">{org_name}</span>
          </div>
          <span className="shrink-0 text-xs text-warm-gray">
            {count} {getTypeLabel(item_type, count)}
          </span>
        </div>

        {/* Preview (collapsed only, multi-item) */}
        {!expanded && !isSingle && (
          <div className="mt-2 space-y-1">
            {previewItems.map((item: WorkItem) => (
              <PreviewLine key={item.id} item={item} />
            ))}
            {count > 3 && (
              <div className="text-[11px] text-warm-gray">+{count - 3} more</div>
            )}
          </div>
        )}

        {/* Single-item card: render the item directly */}
        {isSingle && (
          <div className="mt-3">
            <FeedCardItem
              item={items[0]}
              actionLoading={actionLoading}
              onApprove={onApproveItem}
              onReject={onRejectItem}
              onEdit={onEditItem}
              onRegenerate={onRegenerateItem}
              onDismiss={onDismissItem}
            />
          </div>
        )}

        {/* Actions row (collapsed, multi-item) */}
        {!expanded && !isSingle && (
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {showApproveAll && (
                <button
                  onClick={handleApproveAll}
                  disabled={approveAllLoading}
                  className="px-4 py-1.5 text-xs font-medium bg-ink text-white rounded-full hover:bg-ink/90 disabled:opacity-50 transition-colors"
                >
                  {approveAllLoading
                    ? 'Approving...'
                    : approvableCount < count
                      ? `Approve All (${approvableCount})`
                      : 'Approve All'
                  }
                </button>
              )}
              <button
                onClick={handleRejectAll}
                disabled={rejectAllLoading}
                className="px-4 py-1.5 text-xs text-warm-gray hover:text-red-600 rounded-full border border-warm-border hover:border-red-200 disabled:opacity-50 transition-colors"
              >
                {rejectAllLoading ? 'Skipping...' : 'Skip All'}
              </button>
            </div>
            <button
              onClick={() => setExpanded(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-warm-gray hover:text-ink transition-colors"
            >
              Expand
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Expanded items */}
      {expanded && !isSingle && (
        <div className="px-5 pb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] text-warm-gray uppercase tracking-wider">Individual items</div>
            <button
              onClick={() => setExpanded(false)}
              className="flex items-center gap-1 text-xs text-warm-gray hover:text-ink transition-colors"
            >
              Collapse
              <svg className="w-3 h-3 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          <div className="space-y-2">
            {items.map((item: WorkItem) => (
              <FeedCardItem
                key={item.id}
                item={item}
                actionLoading={actionLoading}
                onApprove={onApproveItem}
                onReject={onRejectItem}
                onEdit={onEditItem}
                onRegenerate={onRegenerateItem}
                onDismiss={onDismissItem}
              />
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-warm-border/50 flex items-center gap-2">
            {showApproveAll && (
              <button
                onClick={handleApproveAll}
                disabled={approveAllLoading}
                className="px-4 py-1.5 text-xs font-medium bg-ink text-white rounded-full hover:bg-ink/90 disabled:opacity-50 transition-colors"
              >
                {approveAllLoading
                  ? 'Approving...'
                  : `Approve Remaining (${approvableCount})`
                }
              </button>
            )}
            <button
              onClick={handleRejectAll}
              disabled={rejectAllLoading}
              className="px-4 py-1.5 text-xs text-warm-gray hover:text-red-600 rounded-full border border-warm-border hover:border-red-200 disabled:opacity-50 transition-colors"
            >
              {rejectAllLoading ? 'Skipping...' : 'Skip Remaining'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Preview Lines ──────────────────────────────────────────

function PreviewLine({ item }: { item: WorkItem }) {
  if ((item.type === 'ai_draft_review' || item.type === 'review_reply') && item.review) {
    return (
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-warm-gray">{renderStarsCompact(item.review.rating)}</span>
        <span className="text-ink/60 truncate">
          {item.review.reviewer_name || 'Anonymous'}
          {item.review.body ? ` — "${truncate(item.review.body, 50)}"` : ''}
        </span>
      </div>
    )
  }

  if (item.type === 'post_pending' && item.post) {
    return (
      <div className="flex items-center gap-2 text-[11px]">
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
          item.post.status === 'draft' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
        }`}>
          {item.post.status}
        </span>
        <span className="text-ink/60 truncate">{truncate(item.post.summary, 60)}</span>
      </div>
    )
  }

  if (item.type === 'sync_error' && item.sync_error) {
    return (
      <div className="text-[11px] text-red-500 truncate">
        {item.location_name}: {item.sync_error.sync_error || 'sync failed'}
      </div>
    )
  }

  if (item.type === 'google_update') {
    return (
      <div className="text-[11px] text-blue-600 truncate">{item.location_name}: pending changes</div>
    )
  }

  if (item.type === 'profile_optimization' && item.profile_optimization) {
    const recs = item.profile_optimization.recommendations || []
    const summaries = recs.map((r: { field: string; proposed_value: unknown }) => {
      if (r.field === 'categories' && Array.isArray(r.proposed_value)) {
        return `+${r.proposed_value.length} categories`
      }
      return r.field
    })
    return (
      <div className="text-[11px] text-ink/60 truncate">
        {item.location_name}: {summaries.join(', ')}
      </div>
    )
  }

  if (item.type === 'stale_lander' && item.stale_lander) {
    return (
      <div className="text-[11px] text-amber-600 truncate">
        {item.location_name}: /l/{item.stale_lander.slug}
      </div>
    )
  }

  return null
}

function renderStarsCompact(rating: number | null) {
  if (rating === null) return ''
  return Array.from({ length: 5 }, (_, i) => i < rating ? '\u2605' : '\u2606').join('')
}

function truncate(str: string, len: number) {
  return str.length > len ? str.slice(0, len) + '...' : str
}
