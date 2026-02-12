'use client'

import { useState, useEffect, useCallback } from 'react'

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

interface WorkItemGoogleUpdate {
  location_id: string
  business_name: string | null
}

interface WorkItemPost {
  id: string
  topic_type: string
  summary: string
  scheduled_for: string | null
}

interface WorkItemSyncError {
  source_type: 'review_source' | 'gbp_profile'
  platform: string
  sync_error: string | null
  last_synced_at: string | null
}

type WorkItemType = 'review_reply' | 'ai_draft_review' | 'google_update' | 'post_pending' | 'sync_error'

interface WorkItem {
  id: string
  type: WorkItemType
  priority: 'urgent' | 'important' | 'info'
  created_at: string
  assigned_to: string | null
  location_id: string
  location_name: string
  org_name: string
  org_slug: string
  review?: WorkItemReview
  google_update?: WorkItemGoogleUpdate
  post?: WorkItemPost
  sync_error?: WorkItemSyncError
}

interface FieldDiff {
  field: string
  label: string
  currentValue: string | null
  googleValue: string | null
}

interface WorkQueueData {
  items: WorkItem[]
  counts: {
    total: number
    needs_reply: number
    ai_drafts: number
    google_updates: number
    posts: number
    sync_errors: number
  }
}

type FilterType = 'all' | 'needs_reply' | 'ai_drafts' | 'google_updates' | 'posts' | 'sync_errors'
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

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/agency/work-queue?filter=${filter}`)
      if (res.ok) {
        const newData: WorkQueueData = await res.json()
        setData(newData)

        if (newData.items.length > 0 && !selectedId) {
          setSelectedId(newData.items[0].id)
        }
        if (selectedId && !newData.items.find((i) => i.id === selectedId)) {
          setSelectedId(newData.items[0]?.id || null)
        }
      }
    } catch {
      // ignore
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
      if (e.target instanceof HTMLTextAreaElement) return

      const item = data?.items[rapidIndex]
      if (!item) return

      if (isReviewItem(item)) {
        switch (e.key) {
          case 'a':
            handleApproveReview(item)
            break
          case 's':
            handleSkipReview(item)
            break
          case 'e':
            setEditMode(true)
            setEditText(item.review?.ai_draft || '')
            break
          case 'r':
            handleRejectReview(item)
            break
        }
      }

      if (e.key === 'Escape') {
        if (editMode) {
          setEditMode(false)
        } else {
          setViewMode('inbox')
        }
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

    if (viewMode === 'inbox') {
      const currentIdx = data.items.findIndex((i) => i.id === itemId)
      const nextItem = newItems[currentIdx] || newItems[currentIdx - 1]
      setSelectedId(nextItem?.id || null)
    } else {
      if (rapidIndex >= newItems.length) {
        setRapidIndex(Math.max(0, newItems.length - 1))
      }
    }

    setEditMode(false)
  }

  // Review actions
  const handleApproveReview = async (item: WorkItem) => {
    const draft = item.review?.ai_draft
    if (!draft) return

    setActionLoading('approve')
    try {
      const res = await fetch(`/api/reviews/${item.review!.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply_body: draft }),
      })
      if (res.ok) removeItem(item.id)
    } catch { /* ignore */ }
    setActionLoading(null)
  }

  const handleEditAndSendReview = async (item: WorkItem) => {
    if (!editText.trim()) return

    setActionLoading('edit')
    try {
      const res = await fetch(`/api/reviews/${item.review!.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply_body: editText.trim() }),
      })
      if (res.ok) removeItem(item.id)
    } catch { /* ignore */ }
    setActionLoading(null)
  }

  const handleRegenerateReview = async (item: WorkItem) => {
    setActionLoading('regenerate')
    try {
      const res = await fetch(`/api/reviews/${item.review!.id}/ai-reply`, { method: 'POST' })
      const result = await res.json()
      if (res.ok && result.draft && data) {
        const newItems = data.items.map((i) =>
          i.id === item.id
            ? { ...i, review: { ...i.review!, ai_draft: result.draft, ai_draft_generated_at: new Date().toISOString() } }
            : i
        )
        setData({ ...data, items: newItems })
        setEditText(result.draft)
      }
    } catch { /* ignore */ }
    setActionLoading(null)
  }

  const handleSkipReview = async (item: WorkItem) => {
    setActionLoading('skip')
    try {
      await fetch(`/api/reviews/${item.review!.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'seen' }),
      })
      removeItem(item.id)
    } catch { /* ignore */ }
    setActionLoading(null)
  }

  const handleRejectReview = async (item: WorkItem) => {
    setActionLoading('reject')
    try {
      await fetch(`/api/reviews/${item.review!.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'seen', clear_draft: true }),
      })
      removeItem(item.id)
    } catch { /* ignore */ }
    setActionLoading(null)
  }

  // Google update actions
  const handleGoogleAction = async (item: WorkItem, action: 'accept' | 'reject') => {
    setActionLoading(action === 'accept' ? 'google_accept' : 'google_reject')
    try {
      const res = await fetch(`/api/locations/${item.location_id}/gbp-profile/google-updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.ok) removeItem(item.id)
    } catch { /* ignore */ }
    setActionLoading(null)
  }

  // Post actions
  const handleDeletePost = async (item: WorkItem) => {
    if (!item.post) return
    setActionLoading('delete_post')
    try {
      const res = await fetch(`/api/locations/${item.location_id}/gbp-posts/${item.post.id}`, {
        method: 'DELETE',
      })
      if (res.ok) removeItem(item.id)
    } catch { /* ignore */ }
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
        <QueueHeader counts={data?.counts} filter={filter} setFilter={setFilter} viewMode={viewMode} setViewMode={setViewMode} itemCount={0} />
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
        <QueueHeader counts={data?.counts} filter={filter} setFilter={setFilter} viewMode={viewMode} setViewMode={setViewMode} itemCount={items.length} />

        <div className="px-6 py-3 border-b border-warm-border flex items-center justify-between">
          <span className="text-xs text-warm-gray font-mono">{rapidIndex + 1} of {items.length}</span>
          <div className="flex-1 mx-4 h-1 bg-warm-light rounded-full overflow-hidden">
            <div className="h-full bg-ink rounded-full transition-all" style={{ width: `${((rapidIndex + 1) / items.length) * 100}%` }} />
          </div>
          <button onClick={() => setViewMode('inbox')} className="text-xs text-warm-gray hover:text-ink transition-colors">Exit</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-8">
            <ItemDetail
              item={rapidItem}
              editMode={editMode}
              editText={editText}
              setEditMode={setEditMode}
              setEditText={setEditText}
              actionLoading={actionLoading}
              onApproveReview={() => handleApproveReview(rapidItem)}
              onEditAndSendReview={() => handleEditAndSendReview(rapidItem)}
              onRegenerateReview={() => handleRegenerateReview(rapidItem)}
              onSkipReview={() => handleSkipReview(rapidItem)}
              onRejectReview={() => handleRejectReview(rapidItem)}
              onGoogleAction={(action) => handleGoogleAction(rapidItem, action)}
              onDeletePost={() => handleDeletePost(rapidItem)}
              onDismiss={() => removeItem(rapidItem.id)}
            />

            {!editMode && isReviewItem(rapidItem) && (
              <div className="mt-6 flex items-center justify-center gap-4">
                {rapidItem.review?.ai_draft && <KbdHint label="Approve" shortcut="a" />}
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
      <QueueHeader counts={data?.counts} filter={filter} setFilter={setFilter} viewMode={viewMode} setViewMode={setViewMode} itemCount={items.length} />

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
                item.id === selectedId ? 'bg-warm-light' : 'hover:bg-warm-light/50'
              }`}
            >
              <ListItemContent item={item} />
            </button>
          ))}
        </div>

        {/* Detail Panel */}
        <div className={`flex-1 overflow-y-auto ${!mobileDetailOpen ? 'hidden lg:block' : ''}`}>
          {selectedItem ? (
            <div className="p-6">
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
                onApproveReview={() => handleApproveReview(selectedItem)}
                onEditAndSendReview={() => handleEditAndSendReview(selectedItem)}
                onRegenerateReview={() => handleRegenerateReview(selectedItem)}
                onSkipReview={() => handleSkipReview(selectedItem)}
                onRejectReview={() => handleRejectReview(selectedItem)}
                onGoogleAction={(action) => handleGoogleAction(selectedItem, action)}
                onDeletePost={() => handleDeletePost(selectedItem)}
                onDismiss={() => removeItem(selectedItem.id)}
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

// ─── List Item Content ──────────────────────────────────────

function ListItemContent({ item }: { item: WorkItem }) {
  if (isReviewItem(item) && item.review) {
    return (
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
            <div className="text-xs text-ink/60 line-clamp-2">{item.review.body}</div>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] text-warm-gray font-mono">{item.review.platform}</span>
            <span className="text-warm-border">·</span>
            <span className="text-[10px] text-warm-gray">{timeAgo(item.review.published_at)}</span>
            {item.review.ai_draft && (
              <>
                <span className="text-warm-border">·</span>
                <span className="text-[10px] text-amber-600 font-medium">Draft ready</span>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (item.type === 'google_update') {
    return (
      <div className="flex items-start gap-3">
        <PriorityDot priority={item.priority} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-ink truncate">Google suggested edits</span>
          </div>
          <div className="text-xs text-warm-gray truncate mb-1">
            {item.location_name} · {item.org_name}
          </div>
          <div className="text-xs text-blue-600">
            Profile has pending Google changes
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <TypeBadge type="google_update" />
            <span className="text-warm-border">·</span>
            <span className="text-[10px] text-warm-gray">{timeAgo(item.created_at)}</span>
          </div>
        </div>
      </div>
    )
  }

  if (item.type === 'post_pending' && item.post) {
    const topicLabels: Record<string, string> = {
      STANDARD: 'Update', EVENT: 'Event', OFFER: 'Offer', ALERT: 'Alert',
    }
    return (
      <div className="flex items-start gap-3">
        <PriorityDot priority={item.priority} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-ink truncate">
              {topicLabels[item.post.topic_type] || 'Post'} pending
            </span>
          </div>
          <div className="text-xs text-warm-gray truncate mb-1">
            {item.location_name} · {item.org_name}
          </div>
          <div className="text-xs text-ink/60 line-clamp-2">{item.post.summary}</div>
          <div className="flex items-center gap-2 mt-1.5">
            <TypeBadge type="post_pending" />
            {item.post.scheduled_for && (
              <>
                <span className="text-warm-border">·</span>
                <span className="text-[10px] text-warm-gray">
                  Scheduled {new Date(item.post.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (item.type === 'sync_error' && item.sync_error) {
    return (
      <div className="flex items-start gap-3">
        <PriorityDot priority={item.priority} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-ink truncate">Sync error</span>
          </div>
          <div className="text-xs text-warm-gray truncate mb-1">
            {item.location_name} · {item.org_name}
          </div>
          <div className="text-xs text-red-500 line-clamp-1">
            {item.sync_error.sync_error || `${item.sync_error.platform} sync failed`}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <TypeBadge type="sync_error" />
            <span className="text-warm-border">·</span>
            <span className="text-[10px] text-warm-gray capitalize">{item.sync_error.platform}</span>
          </div>
        </div>
      </div>
    )
  }

  return null
}

// ─── Detail Panel ───────────────────────────────────────────

function ItemDetail({
  item,
  editMode,
  editText,
  setEditMode,
  setEditText,
  actionLoading,
  onApproveReview,
  onEditAndSendReview,
  onRegenerateReview,
  onSkipReview,
  onRejectReview,
  onGoogleAction,
  onDeletePost,
  onDismiss,
}: {
  item: WorkItem
  editMode: boolean
  editText: string
  setEditMode: (v: boolean) => void
  setEditText: (v: string) => void
  actionLoading: string | null
  onApproveReview: () => void
  onEditAndSendReview: () => void
  onRegenerateReview: () => void
  onSkipReview: () => void
  onRejectReview: () => void
  onGoogleAction: (action: 'accept' | 'reject') => void
  onDeletePost: () => void
  onDismiss: () => void
}) {
  if (isReviewItem(item) && item.review) {
    return (
      <ReviewDetail
        item={item}
        editMode={editMode}
        editText={editText}
        setEditMode={setEditMode}
        setEditText={setEditText}
        actionLoading={actionLoading}
        onApprove={onApproveReview}
        onEditAndSend={onEditAndSendReview}
        onRegenerate={onRegenerateReview}
        onSkip={onSkipReview}
        onReject={onRejectReview}
      />
    )
  }

  if (item.type === 'google_update') {
    return (
      <GoogleUpdateDetail
        item={item}
        actionLoading={actionLoading}
        onAction={onGoogleAction}
      />
    )
  }

  if (item.type === 'post_pending' && item.post) {
    return (
      <PostDetail
        item={item}
        actionLoading={actionLoading}
        onDelete={onDeletePost}
        onDismiss={onDismiss}
      />
    )
  }

  if (item.type === 'sync_error' && item.sync_error) {
    return (
      <SyncErrorDetail
        item={item}
        onDismiss={onDismiss}
      />
    )
  }

  return null
}

// ─── Review Detail ──────────────────────────────────────────

function ReviewDetail({
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
  const review = item.review!
  const isNegative = review.rating !== null && review.rating <= 2

  return (
    <div>
      <div className="flex items-start gap-3 mb-4">
        {review.reviewer_photo_url ? (
          <img src={review.reviewer_photo_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-ink flex items-center justify-center text-cream text-xs font-bold font-mono shrink-0">
            {(review.reviewer_name || 'A')[0].toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink">{review.reviewer_name || 'Anonymous'}</span>
            <PriorityBadge priority={item.priority} />
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-warm-gray font-mono capitalize">{review.platform}</span>
            <span className="text-warm-border">·</span>
            <span className="text-[10px] text-warm-gray">
              {new Date(review.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        </div>
        {review.rating !== null && (
          <div className="flex items-center gap-0.5 shrink-0">
            {[1, 2, 3, 4, 5].map((star) => (
              <span key={star} className={`text-sm ${star <= review.rating! ? 'text-amber-400' : 'text-warm-border'}`}>★</span>
            ))}
          </div>
        )}
      </div>

      <div className="text-xs text-warm-gray mb-4">{item.location_name} · {item.org_name}</div>

      {review.body && (
        <div className={`rounded-xl p-4 mb-4 ${isNegative ? 'bg-red-50 border border-red-200' : 'bg-warm-light/50 border border-warm-border/50'}`}>
          <p className="text-sm text-ink leading-relaxed">{review.body}</p>
        </div>
      )}

      {review.ai_draft && !editMode && (
        <div className="bg-amber-50 rounded-xl p-4 mb-4 border border-amber-200">
          <div className="text-[10px] text-amber-600 uppercase tracking-wider font-medium mb-2">AI Draft Reply</div>
          <p className="text-sm text-ink leading-relaxed">{review.ai_draft}</p>
        </div>
      )}

      {editMode && (
        <div className="mb-4">
          <div className="text-[10px] text-warm-gray uppercase tracking-wider font-medium mb-2">Edit Reply</div>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={4}
            className="w-full px-4 py-3 border border-warm-border rounded-xl text-sm text-ink outline-none focus:ring-2 focus:ring-ink/20 resize-y placeholder:text-warm-gray"
            placeholder="Write your reply..."
            autoFocus
          />
          <div className="flex items-center gap-2 mt-2">
            <button onClick={onEditAndSend} disabled={actionLoading === 'edit' || !editText.trim()} className="px-4 py-2 bg-ink hover:bg-ink/90 text-cream text-xs font-medium rounded-full transition-colors disabled:opacity-50">
              {actionLoading === 'edit' ? 'Sending...' : 'Send Reply'}
            </button>
            <button onClick={() => setEditMode(false)} className="px-4 py-2 text-xs text-warm-gray hover:text-ink transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {!editMode && (
        <div className="flex items-center gap-2 flex-wrap">
          {review.ai_draft && (
            <button onClick={onApprove} disabled={actionLoading === 'approve'} className="px-5 py-2.5 bg-ink hover:bg-ink/90 text-cream text-xs font-medium rounded-full transition-colors disabled:opacity-50">
              {actionLoading === 'approve' ? 'Sending...' : 'Send Reply'}
            </button>
          )}
          <button
            onClick={() => { setEditMode(true); setEditText(review.ai_draft || '') }}
            className="px-4 py-2.5 border border-warm-border text-xs text-ink rounded-full hover:border-ink transition-colors"
          >
            {review.ai_draft ? 'Edit & Send' : 'Write Reply'}
          </button>
          <button onClick={onRegenerate} disabled={actionLoading === 'regenerate'} className="px-4 py-2.5 border border-warm-border text-xs text-warm-gray rounded-full hover:text-ink hover:border-ink transition-colors disabled:opacity-50">
            {actionLoading === 'regenerate' ? 'Generating...' : 'Regenerate'}
          </button>
          <div className="flex-1" />
          <button onClick={onSkip} disabled={actionLoading === 'skip'} className="px-4 py-2.5 text-xs text-warm-gray hover:text-ink transition-colors disabled:opacity-50">Skip</button>
          <button onClick={onReject} disabled={actionLoading === 'reject'} className="px-4 py-2.5 text-xs text-warm-gray hover:text-red-600 transition-colors disabled:opacity-50">Reject</button>
        </div>
      )}
    </div>
  )
}

// ─── Google Update Detail ───────────────────────────────────

function GoogleUpdateDetail({
  item,
  actionLoading,
  onAction,
}: {
  item: WorkItem
  actionLoading: string | null
  onAction: (action: 'accept' | 'reject') => void
}) {
  const [diffs, setDiffs] = useState<FieldDiff[] | null>(null)
  const [loadingDiffs, setLoadingDiffs] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/locations/${item.location_id}/gbp-profile/google-updates`)
        const data = await res.json()
        if (!cancelled) setDiffs(data.diffs || [])
      } catch {
        if (!cancelled) setDiffs([])
      }
      if (!cancelled) setLoadingDiffs(false)
    }
    load()
    return () => { cancelled = true }
  }, [item.location_id])

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
          <GoogleIcon className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink">Google Suggested Edits</span>
            <PriorityBadge priority="urgent" />
          </div>
          <div className="text-[10px] text-warm-gray mt-0.5">
            {item.google_update?.business_name || item.location_name}
          </div>
        </div>
      </div>

      <div className="text-xs text-warm-gray mb-4">{item.location_name} · {item.org_name}</div>

      {loadingDiffs ? (
        <div className="py-8 text-center text-xs text-warm-gray animate-pulse">Loading changes from Google...</div>
      ) : diffs && diffs.length > 0 ? (
        <div className="space-y-3 mb-6">
          {diffs.map((d) => (
            <div key={d.field} className="text-xs">
              <div className="font-medium text-ink mb-1.5">{d.label}</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-warm-light/50 rounded-lg p-3 border border-warm-border/50">
                  <div className="text-[10px] text-warm-gray uppercase tracking-wider mb-1">Current</div>
                  <div className="text-sm text-ink">{d.currentValue || '(empty)'}</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                  <div className="text-[10px] text-blue-500 uppercase tracking-wider mb-1">Google suggests</div>
                  <div className="text-sm text-ink">{d.googleValue || '(empty)'}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-6 text-center text-xs text-warm-gray mb-4">
          No field-level differences found. Data already matches Google.
        </div>
      )}

      {diffs && diffs.length > 0 ? (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAction('accept')}
            disabled={actionLoading === 'google_accept'}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-full transition-colors disabled:opacity-50"
          >
            {actionLoading === 'google_accept' ? 'Accepting...' : 'Accept Changes'}
          </button>
          <button
            onClick={() => onAction('reject')}
            disabled={actionLoading === 'google_reject'}
            className="px-4 py-2.5 border border-warm-border text-xs text-warm-gray rounded-full hover:text-ink hover:border-ink transition-colors disabled:opacity-50"
          >
            {actionLoading === 'google_reject' ? 'Rejecting...' : 'Reject & Keep Current'}
          </button>
        </div>
      ) : !loadingDiffs ? (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAction('accept')}
            disabled={actionLoading === 'google_accept'}
            className="px-4 py-2.5 border border-warm-border text-xs text-ink rounded-full hover:border-ink transition-colors disabled:opacity-50"
          >
            {actionLoading === 'google_accept' ? 'Resolving...' : 'Mark Resolved'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

// ─── Post Detail ────────────────────────────────────────────

function PostDetail({
  item,
  actionLoading,
  onDelete,
  onDismiss,
}: {
  item: WorkItem
  actionLoading: string | null
  onDelete: () => void
  onDismiss: () => void
}) {
  const post = item.post!
  const topicStyles: Record<string, { label: string; classes: string }> = {
    STANDARD: { label: 'Update', classes: 'bg-warm-light text-warm-gray' },
    EVENT: { label: 'Event', classes: 'bg-blue-50 text-blue-600' },
    OFFER: { label: 'Offer', classes: 'bg-amber-50 text-amber-600' },
    ALERT: { label: 'Alert', classes: 'bg-red-50 text-red-600' },
  }
  const style = topicStyles[post.topic_type] || topicStyles.STANDARD

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-warm-light flex items-center justify-center shrink-0">
          <PostIcon className="w-5 h-5 text-ink" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink">Pending Post</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${style.classes}`}>
              {style.label}
            </span>
          </div>
          <div className="text-[10px] text-warm-gray mt-0.5">{item.location_name}</div>
        </div>
      </div>

      <div className="text-xs text-warm-gray mb-4">{item.location_name} · {item.org_name}</div>

      <div className="bg-warm-light/50 rounded-xl p-4 mb-4 border border-warm-border/50">
        <p className="text-sm text-ink leading-relaxed">{post.summary}</p>
      </div>

      {post.scheduled_for && (
        <div className="text-xs text-warm-gray mb-4">
          Scheduled for{' '}
          {new Date(post.scheduled_for).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button onClick={onDismiss} className="px-4 py-2.5 border border-warm-border text-xs text-warm-gray rounded-full hover:text-ink hover:border-ink transition-colors">
          Dismiss
        </button>
        <button
          onClick={onDelete}
          disabled={actionLoading === 'delete_post'}
          className="px-4 py-2.5 text-xs text-warm-gray hover:text-red-600 transition-colors disabled:opacity-50"
        >
          {actionLoading === 'delete_post' ? 'Deleting...' : 'Delete Post'}
        </button>
      </div>
    </div>
  )
}

// ─── Sync Error Detail ──────────────────────────────────────

function SyncErrorDetail({
  item,
  onDismiss,
}: {
  item: WorkItem
  onDismiss: () => void
}) {
  const error = item.sync_error!

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
          <AlertIcon className="w-5 h-5 text-red-600" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink">Sync Error</span>
            <PriorityBadge priority="important" />
          </div>
          <div className="text-[10px] text-warm-gray mt-0.5 capitalize">
            {error.source_type === 'review_source' ? 'Review source' : 'GBP profile'} · {error.platform}
          </div>
        </div>
      </div>

      <div className="text-xs text-warm-gray mb-4">{item.location_name} · {item.org_name}</div>

      {error.sync_error && (
        <div className="bg-red-50 rounded-xl p-4 mb-4 border border-red-200">
          <div className="text-[10px] text-red-500 uppercase tracking-wider font-medium mb-1">Error</div>
          <p className="text-sm text-ink leading-relaxed">{error.sync_error}</p>
        </div>
      )}

      {error.last_synced_at && (
        <div className="text-xs text-warm-gray mb-4">
          Last synced {timeAgo(error.last_synced_at)} ago
        </div>
      )}

      <div className="flex items-center gap-2">
        <a
          href={`/admin/${item.org_slug}/locations/${item.location_id}`}
          className="px-4 py-2.5 border border-warm-border text-xs text-ink rounded-full hover:border-ink transition-colors no-underline"
        >
          View Location
        </a>
        <button onClick={onDismiss} className="px-4 py-2.5 text-xs text-warm-gray hover:text-ink transition-colors">
          Dismiss
        </button>
      </div>
    </div>
  )
}

// ─── Shared Components ──────────────────────────────────────

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
  const urgentCount = (counts?.needs_reply || 0) + (counts?.google_updates || 0)

  return (
    <div className="px-6 py-4 border-b border-warm-border">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-lg font-serif text-ink">Work Queue</h1>
          <div className="text-xs text-warm-gray mt-0.5">
            {itemCount} item{itemCount === 1 ? '' : 's'}
            {urgentCount > 0 && <span className="text-red-500"> · {urgentCount} urgent</span>}
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

      <div className="flex gap-1 overflow-x-auto">
        <FilterTab active={filter === 'all'} onClick={() => setFilter('all')} label="All" count={counts?.total} />
        <FilterTab active={filter === 'needs_reply'} onClick={() => setFilter('needs_reply')} label="Reviews" count={(counts?.needs_reply || 0) + (counts?.ai_drafts || 0)} />
        <FilterTab active={filter === 'google_updates'} onClick={() => setFilter('google_updates')} label="Profiles" count={counts?.google_updates} />
        <FilterTab active={filter === 'posts'} onClick={() => setFilter('posts')} label="Posts" count={counts?.posts} />
        <FilterTab active={filter === 'sync_errors'} onClick={() => setFilter('sync_errors')} label="Errors" count={counts?.sync_errors} />
      </div>
    </div>
  )
}

function FilterTab({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs rounded-full whitespace-nowrap transition-colors ${
        active ? 'bg-ink text-cream' : 'text-warm-gray hover:text-ink hover:bg-warm-light'
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className={`ml-1.5 ${active ? 'text-cream/70' : 'text-warm-gray/60'}`}>{count}</span>
      )}
    </button>
  )
}

function KbdHint({ label, shortcut }: { label: string; shortcut: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-warm-gray">
      <kbd className="px-1.5 py-0.5 bg-warm-light border border-warm-border rounded font-mono text-[10px]">{shortcut}</kbd>
      {label}
    </div>
  )
}

function PriorityDot({ priority }: { priority: string }) {
  const colors: Record<string, string> = { urgent: 'bg-red-500', important: 'bg-amber-500', info: 'bg-warm-border' }
  return <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${colors[priority] || 'bg-warm-border'}`} />
}

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === 'urgent') {
    return <span className="text-[10px] text-red-600 font-medium bg-red-50 px-1.5 py-0.5 rounded">Urgent</span>
  }
  return null
}

function TypeBadge({ type }: { type: string }) {
  const config: Record<string, { label: string; classes: string }> = {
    google_update: { label: 'Profile', classes: 'text-blue-600 bg-blue-50' },
    post_pending: { label: 'Post', classes: 'text-amber-600 bg-amber-50' },
    sync_error: { label: 'Error', classes: 'text-red-600 bg-red-50' },
  }
  const c = config[type]
  if (!c) return null
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${c.classes}`}>{c.label}</span>
}

// ─── Helpers ────────────────────────────────────────────────

function isReviewItem(item: WorkItem): boolean {
  return item.type === 'review_reply' || item.type === 'ai_draft_review'
}

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

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  )
}

function PostIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  )
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}
