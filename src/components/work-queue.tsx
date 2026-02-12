'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────

interface WorkItemReview {
  id: string
  reviewer_name: string | null
  reviewer_photo_url: string | null
  rating: number | null
  body: string | null
  platform: string
  published_at: string
  sentiment: string | null
  ai_draft: string | null
  ai_draft_generated_at: string | null
  status: string
}

interface WorkItem {
  id: string
  type: 'review_reply' | 'ai_draft_review'
  priority: 'urgent' | 'important'
  created_at: string
  assigned_to: string | null
  location_id: string
  location_name: string
  org_name: string
  org_slug: string
  review: WorkItemReview
}

interface WorkQueueData {
  items: WorkItem[]
  counts: {
    total: number
    needs_reply: number
    ai_drafts: number
  }
}

type FilterType = 'all' | 'needs_reply' | 'ai_drafts'
type ViewMode = 'inbox' | 'rapid'

// ─── Main Component ───────────────────────────────────────────

export function WorkQueue() {
  const [data, setData] = useState<WorkQueueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('inbox')
  const [rapidIndex, setRapidIndex] = useState(0)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editText, setEditText] = useState('')
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const router = useRouter()

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/agency/work-queue?filter=${filter}`)
      if (res.ok) {
        const newData: WorkQueueData = await res.json()
        setData(newData)

        // Auto-select first item if nothing selected
        if (newData.items.length > 0 && !selectedId) {
          setSelectedId(newData.items[0].id)
        }
        // If selected item was resolved, move to next
        if (selectedId && !newData.items.find((i) => i.id === selectedId)) {
          setSelectedId(newData.items[0]?.id || null)
        }
      }
    } catch {
      // ignore fetch errors
    } finally {
      setLoading(false)
    }
  }, [filter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLoading(true)
    fetchData()

    const interval = setInterval(fetchData, 60_000)
    const handleFocus = () => fetchData()
    window.addEventListener('focus', handleFocus)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
    }
  }, [fetchData])

  // Keyboard shortcuts for rapid review mode
  useEffect(() => {
    if (viewMode !== 'rapid') return

    const handleKey = (e: KeyboardEvent) => {
      // Don't capture when typing in textarea
      if (e.target instanceof HTMLTextAreaElement) return

      const item = data?.items[rapidIndex]
      if (!item) return

      switch (e.key) {
        case 'a':
          handleApprove(item)
          break
        case 's':
          handleSkip(item)
          break
        case 'e':
          setEditMode(true)
          setEditText(item.review.ai_draft || '')
          break
        case 'r':
          handleReject(item)
          break
        case 'Escape':
          if (editMode) {
            setEditMode(false)
          } else {
            setViewMode('inbox')
          }
          break
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [viewMode, rapidIndex, data, editMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Actions ──────────────────────────────────────────────

  const removeItem = (itemId: string) => {
    if (!data) return
    const newItems = data.items.filter((i) => i.id !== itemId)
    setData({ ...data, items: newItems, counts: { ...data.counts, total: newItems.length } })

    // Auto-select next item
    if (viewMode === 'inbox') {
      const currentIdx = data.items.findIndex((i) => i.id === itemId)
      const nextItem = newItems[currentIdx] || newItems[currentIdx - 1]
      setSelectedId(nextItem?.id || null)
    } else {
      // Rapid mode: stay at same index (next item shifts in)
      if (rapidIndex >= newItems.length) {
        setRapidIndex(Math.max(0, newItems.length - 1))
      }
    }

    setEditMode(false)
  }

  const handleApprove = async (item: WorkItem) => {
    const draft = item.review.ai_draft
    if (!draft) return

    setActionLoading('approve')
    try {
      const res = await fetch(`/api/reviews/${item.review.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply_body: draft }),
      })
      if (res.ok) {
        removeItem(item.id)
      }
    } catch {
      // ignore
    }
    setActionLoading(null)
  }

  const handleEditAndSend = async (item: WorkItem) => {
    if (!editText.trim()) return

    setActionLoading('edit')
    try {
      const res = await fetch(`/api/reviews/${item.review.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply_body: editText.trim() }),
      })
      if (res.ok) {
        removeItem(item.id)
      }
    } catch {
      // ignore
    }
    setActionLoading(null)
  }

  const handleRegenerate = async (item: WorkItem) => {
    setActionLoading('regenerate')
    try {
      const res = await fetch(`/api/reviews/${item.review.id}/ai-reply`, {
        method: 'POST',
      })
      const result = await res.json()
      if (res.ok && result.draft && data) {
        // Update the draft in local state
        const newItems = data.items.map((i) =>
          i.id === item.id
            ? { ...i, review: { ...i.review, ai_draft: result.draft, ai_draft_generated_at: new Date().toISOString() } }
            : i
        )
        setData({ ...data, items: newItems })
        setEditText(result.draft)
      }
    } catch {
      // ignore
    }
    setActionLoading(null)
  }

  const handleSkip = async (item: WorkItem) => {
    setActionLoading('skip')
    try {
      await fetch(`/api/reviews/${item.review.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'seen' }),
      })
      removeItem(item.id)
    } catch {
      // ignore
    }
    setActionLoading(null)
  }

  const handleReject = async (item: WorkItem) => {
    setActionLoading('reject')
    try {
      // Clear AI draft and mark as seen
      await fetch(`/api/reviews/${item.review.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'seen', clear_draft: true }),
      })
      removeItem(item.id)
    } catch {
      // ignore
    }
    setActionLoading(null)
  }

  // ─── Derived state ────────────────────────────────────────

  const items = data?.items || []
  const selectedItem = items.find((i) => i.id === selectedId)
  const rapidItem = items[rapidIndex]

  // ─── Loading state ────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-pulse text-sm text-warm-gray">Loading queue...</div>
      </div>
    )
  }

  // ─── Empty state ──────────────────────────────────────────

  if (items.length === 0) {
    return (
      <div className="h-screen flex flex-col">
        <QueueHeader
          counts={data?.counts}
          filter={filter}
          setFilter={setFilter}
          viewMode={viewMode}
          setViewMode={setViewMode}
          itemCount={0}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <CheckIcon className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="text-sm font-medium text-ink">All clear</div>
            <div className="text-xs text-warm-gray mt-1">No items need attention</div>
          </div>
        </div>
      </div>
    )
  }

  // ─── Rapid Review Mode ────────────────────────────────────

  if (viewMode === 'rapid') {
    if (!rapidItem) {
      setViewMode('inbox')
      return null
    }

    return (
      <div className="h-screen flex flex-col">
        <QueueHeader
          counts={data?.counts}
          filter={filter}
          setFilter={setFilter}
          viewMode={viewMode}
          setViewMode={setViewMode}
          itemCount={items.length}
        />

        {/* Progress bar */}
        <div className="px-6 py-3 border-b border-warm-border flex items-center justify-between">
          <span className="text-xs text-warm-gray font-mono">
            {rapidIndex + 1} of {items.length}
          </span>
          <div className="flex-1 mx-4 h-1 bg-warm-light rounded-full overflow-hidden">
            <div
              className="h-full bg-ink rounded-full transition-all"
              style={{ width: `${((rapidIndex + 1) / items.length) * 100}%` }}
            />
          </div>
          <button
            onClick={() => setViewMode('inbox')}
            className="text-xs text-warm-gray hover:text-ink transition-colors"
          >
            Exit
          </button>
        </div>

        {/* Single item view */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-8">
            <ItemDetail
              item={rapidItem}
              editMode={editMode}
              editText={editText}
              setEditMode={setEditMode}
              setEditText={setEditText}
              actionLoading={actionLoading}
              onApprove={() => handleApprove(rapidItem)}
              onEditAndSend={() => handleEditAndSend(rapidItem)}
              onRegenerate={() => handleRegenerate(rapidItem)}
              onSkip={() => handleSkip(rapidItem)}
              onReject={() => handleReject(rapidItem)}
            />

            {/* Keyboard hints */}
            {!editMode && (
              <div className="mt-6 flex items-center justify-center gap-4">
                {rapidItem.review.ai_draft && (
                  <KbdHint label="Approve" shortcut="a" />
                )}
                <KbdHint label="Edit" shortcut="e" />
                <KbdHint label="Skip" shortcut="s" />
                <KbdHint label="Reject" shortcut="r" />
                <KbdHint label="Exit" shortcut="esc" />
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── Inbox Mode ───────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col">
      <QueueHeader
        counts={data?.counts}
        filter={filter}
        setFilter={setFilter}
        viewMode={viewMode}
        setViewMode={setViewMode}
        itemCount={items.length}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Item List */}
        <div className={`w-full lg:w-[380px] lg:border-r lg:border-warm-border overflow-y-auto ${mobileDetailOpen ? 'hidden lg:block' : ''}`}>
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setSelectedId(item.id)
                setEditMode(false)
                setMobileDetailOpen(true)
              }}
              className={`w-full text-left px-5 py-4 border-b border-warm-border/50 transition-colors ${
                item.id === selectedId
                  ? 'bg-warm-light'
                  : 'hover:bg-warm-light/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <PriorityDot priority={item.priority} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-ink truncate">
                      {item.review.reviewer_name || 'Anonymous'}
                    </span>
                    {item.review.rating !== null && (
                      <span className="text-[10px] text-warm-gray shrink-0">
                        {renderStarsCompact(item.review.rating)}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-warm-gray truncate mb-1">
                    {item.location_name} · {item.org_name}
                  </div>
                  {item.review.body && (
                    <div className="text-xs text-ink/60 line-clamp-2">
                      {item.review.body}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] text-warm-gray font-mono">
                      {item.review.platform}
                    </span>
                    <span className="text-warm-border">·</span>
                    <span className="text-[10px] text-warm-gray">
                      {timeAgo(item.review.published_at)}
                    </span>
                    {item.review.ai_draft && (
                      <>
                        <span className="text-warm-border">·</span>
                        <span className="text-[10px] text-amber-600 font-medium">
                          Draft ready
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Detail Panel */}
        <div className={`flex-1 overflow-y-auto ${!mobileDetailOpen ? 'hidden lg:block' : ''}`}>
          {selectedItem ? (
            <div className="p-6">
              {/* Mobile back button */}
              <button
                onClick={() => setMobileDetailOpen(false)}
                className="lg:hidden flex items-center gap-1.5 text-xs text-warm-gray mb-4 hover:text-ink transition-colors"
              >
                <BackIcon className="w-3.5 h-3.5" />
                Back to list
              </button>

              <ItemDetail
                item={selectedItem}
                editMode={editMode}
                editText={editText}
                setEditMode={setEditMode}
                setEditText={setEditText}
                actionLoading={actionLoading}
                onApprove={() => handleApprove(selectedItem)}
                onEditAndSend={() => handleEditAndSend(selectedItem)}
                onRegenerate={() => handleRegenerate(selectedItem)}
                onSkip={() => handleSkip(selectedItem)}
                onReject={() => handleReject(selectedItem)}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-warm-gray">
              Select an item from the list
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────

function QueueHeader({
  counts,
  filter,
  setFilter,
  viewMode,
  setViewMode,
  itemCount,
}: {
  counts?: WorkQueueData['counts'] | null
  filter: FilterType
  setFilter: (f: FilterType) => void
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void
  itemCount: number
}) {
  return (
    <div className="px-6 py-4 border-b border-warm-border">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-lg font-serif text-ink">Work Queue</h1>
          <div className="text-xs text-warm-gray mt-0.5">
            {itemCount} item{itemCount === 1 ? '' : 's'}
            {counts && counts.needs_reply > 0 && (
              <span className="text-red-500"> · {counts.needs_reply} urgent</span>
            )}
          </div>
        </div>
        {itemCount > 0 && (
          <button
            onClick={() => setViewMode(viewMode === 'inbox' ? 'rapid' : 'inbox')}
            className="px-3 py-1.5 text-xs border border-warm-border rounded-full text-warm-gray hover:text-ink hover:border-ink transition-colors"
          >
            {viewMode === 'inbox' ? 'Rapid review' : 'Inbox view'}
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto">
        <FilterTab
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          label="All"
          count={counts?.total}
        />
        <FilterTab
          active={filter === 'needs_reply'}
          onClick={() => setFilter('needs_reply')}
          label="Needs Reply"
          count={counts?.needs_reply}
        />
        <FilterTab
          active={filter === 'ai_drafts'}
          onClick={() => setFilter('ai_drafts')}
          label="AI Drafts"
          count={counts?.ai_drafts}
        />
      </div>
    </div>
  )
}

function FilterTab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs rounded-full whitespace-nowrap transition-colors ${
        active
          ? 'bg-ink text-cream'
          : 'text-warm-gray hover:text-ink hover:bg-warm-light'
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className={`ml-1.5 ${active ? 'text-cream/70' : 'text-warm-gray/60'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

function ItemDetail({
  item,
  editMode,
  editText,
  setEditMode,
  setEditText,
  actionLoading,
  onApprove,
  onEditAndSend,
  onRegenerate,
  onSkip,
  onReject,
}: {
  item: WorkItem
  editMode: boolean
  editText: string
  setEditMode: (v: boolean) => void
  setEditText: (v: string) => void
  actionLoading: string | null
  onApprove: () => void
  onEditAndSend: () => void
  onRegenerate: () => void
  onSkip: () => void
  onReject: () => void
}) {
  const review = item.review
  const isNegative = review.rating !== null && review.rating <= 2

  return (
    <div>
      {/* Review header */}
      <div className="flex items-start gap-3 mb-4">
        {review.reviewer_photo_url ? (
          <img
            src={review.reviewer_photo_url}
            alt=""
            className="w-10 h-10 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-ink flex items-center justify-center text-cream text-xs font-bold font-mono shrink-0">
            {(review.reviewer_name || 'A')[0].toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink">
              {review.reviewer_name || 'Anonymous'}
            </span>
            <PriorityBadge priority={item.priority} />
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-warm-gray font-mono capitalize">{review.platform}</span>
            <span className="text-warm-border">·</span>
            <span className="text-[10px] text-warm-gray">
              {new Date(review.published_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
        </div>
        {review.rating !== null && (
          <div className="flex items-center gap-0.5 shrink-0">
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
      </div>

      {/* Location context */}
      <div className="text-xs text-warm-gray mb-4">
        {item.location_name} · {item.org_name}
      </div>

      {/* Review body */}
      {review.body && (
        <div className={`rounded-xl p-4 mb-4 ${
          isNegative ? 'bg-red-50 border border-red-200' : 'bg-warm-light/50 border border-warm-border/50'
        }`}>
          <p className="text-sm text-ink leading-relaxed">{review.body}</p>
        </div>
      )}

      {/* AI Draft */}
      {review.ai_draft && !editMode && (
        <div className="bg-amber-50 rounded-xl p-4 mb-4 border border-amber-200">
          <div className="text-[10px] text-amber-600 uppercase tracking-wider font-medium mb-2">
            AI Draft Reply
          </div>
          <p className="text-sm text-ink leading-relaxed">{review.ai_draft}</p>
        </div>
      )}

      {/* Edit mode */}
      {editMode && (
        <div className="mb-4">
          <div className="text-[10px] text-warm-gray uppercase tracking-wider font-medium mb-2">
            Edit Reply
          </div>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={4}
            className="w-full px-4 py-3 border border-warm-border rounded-xl text-sm text-ink outline-none focus:ring-2 focus:ring-ink/20 resize-y placeholder:text-warm-gray"
            placeholder="Write your reply..."
            autoFocus
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={onEditAndSend}
              disabled={actionLoading === 'edit' || !editText.trim()}
              className="px-4 py-2 bg-ink hover:bg-ink/90 text-cream text-xs font-medium rounded-full transition-colors disabled:opacity-50"
            >
              {actionLoading === 'edit' ? 'Sending...' : 'Send Reply'}
            </button>
            <button
              onClick={() => setEditMode(false)}
              className="px-4 py-2 text-xs text-warm-gray hover:text-ink transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!editMode && (
        <div className="flex items-center gap-2 flex-wrap">
          {review.ai_draft && (
            <button
              onClick={onApprove}
              disabled={actionLoading === 'approve'}
              className="px-5 py-2.5 bg-ink hover:bg-ink/90 text-cream text-xs font-medium rounded-full transition-colors disabled:opacity-50"
            >
              {actionLoading === 'approve' ? 'Sending...' : 'Send Reply'}
            </button>
          )}
          <button
            onClick={() => {
              setEditMode(true)
              setEditText(review.ai_draft || '')
            }}
            className="px-4 py-2.5 border border-warm-border text-xs text-ink rounded-full hover:border-ink transition-colors"
          >
            {review.ai_draft ? 'Edit & Send' : 'Write Reply'}
          </button>
          <button
            onClick={onRegenerate}
            disabled={actionLoading === 'regenerate'}
            className="px-4 py-2.5 border border-warm-border text-xs text-warm-gray rounded-full hover:text-ink hover:border-ink transition-colors disabled:opacity-50"
          >
            {actionLoading === 'regenerate' ? 'Generating...' : 'Regenerate'}
          </button>

          <div className="flex-1" />

          <button
            onClick={onSkip}
            disabled={actionLoading === 'skip'}
            className="px-4 py-2.5 text-xs text-warm-gray hover:text-ink transition-colors disabled:opacity-50"
          >
            Skip
          </button>
          <button
            onClick={onReject}
            disabled={actionLoading === 'reject'}
            className="px-4 py-2.5 text-xs text-warm-gray hover:text-red-600 transition-colors disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  )
}

function KbdHint({ label, shortcut }: { label: string; shortcut: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-warm-gray">
      <kbd className="px-1.5 py-0.5 bg-warm-light border border-warm-border rounded font-mono text-[10px]">
        {shortcut}
      </kbd>
      {label}
    </div>
  )
}

function PriorityDot({ priority }: { priority: 'urgent' | 'important' }) {
  return (
    <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
      priority === 'urgent' ? 'bg-red-500' : 'bg-amber-500'
    }`} />
  )
}

function PriorityBadge({ priority }: { priority: 'urgent' | 'important' }) {
  if (priority === 'urgent') {
    return (
      <span className="text-[10px] text-red-600 font-medium bg-red-50 px-1.5 py-0.5 rounded">
        Urgent
      </span>
    )
  }
  return null
}

// ─── Helpers ────────────────────────────────────────────────

function renderStarsCompact(rating: number): string {
  return '★'.repeat(rating) + '☆'.repeat(5 - rating)
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

// ─── Icons ──────────────────────────────────────────────────

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}
