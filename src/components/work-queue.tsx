'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

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
  media_url: string | null
  scheduled_for: string | null
  status: string
  source: string
}

interface WorkItemSyncError {
  source_type: 'review_source' | 'gbp_profile'
  platform: string
  sync_error: string | null
  last_synced_at: string | null
}

interface WorkItemProfileOptRec {
  id: string
  field: string
  current_value: unknown
  proposed_value: unknown
  ai_rationale: string | null
  status: string
  requires_client_approval: boolean
  edited_value: unknown | null
}

interface WorkItemProfileOpt {
  batch_id: string
  recommendations: WorkItemProfileOptRec[]
}

interface WorkItemStaleLander {
  lander_id: string
  slug: string
}

interface WorkItemCitation {
  id: string
  directory_name: string
  directory_url: string | null
  listing_url: string | null
  nap_correct: boolean
  name_match: boolean
  address_match: boolean
  phone_match: boolean
  found_name: string | null
  found_address: string | null
  found_phone: string | null
  status: string
  ai_recommendation: string | null
}

type WorkItemType = 'review_reply' | 'ai_draft_review' | 'google_update' | 'post_pending' | 'sync_error' | 'profile_optimization' | 'stale_lander' | 'citation'

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
  profile_optimization?: WorkItemProfileOpt
  stale_lander?: WorkItemStaleLander
  citation?: WorkItemCitation
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
    profile_optimizations: number
    stale_landers: number
    citations: number
  }
  has_more?: boolean
  offset?: number
  scope?: 'all' | 'mine'
  is_agency_admin?: boolean
}

type FilterType = 'all' | 'needs_reply' | 'ai_drafts' | 'google_updates' | 'posts' | 'sync_errors' | 'profile_optimizations' | 'stale_landers' | 'citations'
type ScopeType = 'all' | 'mine'

interface TeamMember {
  id: string
  email: string
}

// ─── Main Component ───────────────────────────────────────────

export function WorkQueue() {
  const [data, setData] = useState<WorkQueueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [filter, setFilter] = useState<FilterType>('all')
  const [scope, setScope] = useState<ScopeType>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editText, setEditText] = useState('')
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const sentinelRef = useRef<HTMLDivElement>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/agency/work-queue?filter=${filter}&scope=${scope}`)
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
  }, [filter, scope]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchMore = useCallback(async () => {
    if (!data?.has_more || loadingMore) return
    setLoadingMore(true)
    try {
      const offset = data.items.length
      const res = await fetch(`/api/agency/work-queue?filter=${filter}&scope=${scope}&offset=${offset}`)
      if (res.ok) {
        const page: WorkQueueData = await res.json()
        setData((prev) => prev ? {
          ...prev,
          items: [...prev.items, ...page.items],
          has_more: page.has_more,
        } : prev)
      }
    } catch {
      // ignore
    } finally {
      setLoadingMore(false)
    }
  }, [data?.has_more, data?.items.length, loadingMore, filter, scope])

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

  // Fetch team members for assignment dropdown
  useEffect(() => {
    fetch('/api/agency/members')
      .then((res) => res.ok ? res.json() : { members: [] })
      .then((data) => setTeamMembers(data.members || []))
      .catch(() => {})
  }, [])

  // Infinite scroll — load more when sentinel becomes visible
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchMore()
      },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [fetchMore])

  // ─── Actions ──────────────────────────────────────────────

  const removeItem = (itemId: string) => {
    if (!data) return
    const newItems = data.items.filter((i) => i.id !== itemId)
    setData({ ...data, items: newItems, counts: { ...data.counts, total: newItems.length } })

    const currentIdx = data.items.findIndex((i) => i.id === itemId)
    const nextItem = newItems[currentIdx] || newItems[currentIdx - 1]
    setSelectedId(nextItem?.id || null)
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
  const handleApprovePost = async (item: WorkItem) => {
    if (!item.post) return
    setActionLoading('approve_post')
    try {
      const res = await fetch(`/api/posts/${item.post.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'agency_approve' }),
      })
      if (res.ok) removeItem(item.id)
    } catch { /* ignore */ }
    setActionLoading(null)
  }

  const handleEditPost = async (item: WorkItem) => {
    if (!item.post || !editText.trim()) return
    setActionLoading('edit_post')
    try {
      const res = await fetch(`/api/posts/${item.post.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'edit', summary: editText.trim() }),
      })
      if (res.ok && data) {
        const newItems = data.items.map((i) =>
          i.id === item.id ? { ...i, post: { ...i.post!, summary: editText.trim() } } : i
        )
        setData({ ...data, items: newItems })
        setEditMode(false)
      }
    } catch { /* ignore */ }
    setActionLoading(null)
  }

  const handleRejectPost = async (item: WorkItem) => {
    if (!item.post) return
    setActionLoading('reject_post')
    try {
      const res = await fetch(`/api/posts/${item.post.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      })
      if (res.ok) removeItem(item.id)
    } catch { /* ignore */ }
    setActionLoading(null)
  }

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

  // Profile optimization actions
  const handleApproveRec = async (item: WorkItem, recId: string, editedValue?: unknown) => {
    setActionLoading(`approve_rec_${recId}`)
    try {
      const res = await fetch(`/api/locations/${item.location_id}/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', recommendation_id: recId, edited_value: editedValue }),
      })
      if (res.ok) fetchData()
    } catch { /* ignore */ }
    setActionLoading(null)
  }

  const handleApproveBatch = async (item: WorkItem) => {
    if (!item.profile_optimization) return
    setActionLoading('approve_batch')
    try {
      const firstRec = item.profile_optimization.recommendations[0]
      const res = await fetch(`/api/locations/${item.location_id}/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve_batch',
          recommendation_id: firstRec.id,
          batch_id: item.profile_optimization.batch_id,
        }),
      })
      if (res.ok) removeItem(item.id)
    } catch { /* ignore */ }
    setActionLoading(null)
  }

  const handleRejectRec = async (item: WorkItem, recId: string) => {
    setActionLoading(`reject_rec_${recId}`)
    try {
      const res = await fetch(`/api/locations/${item.location_id}/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', recommendation_id: recId }),
      })
      if (res.ok) fetchData()
    } catch { /* ignore */ }
    setActionLoading(null)
  }

  const handleEditRec = async (item: WorkItem, recId: string, editedValue: unknown) => {
    setActionLoading(`edit_rec_${recId}`)
    try {
      await fetch(`/api/locations/${item.location_id}/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'edit', recommendation_id: recId, edited_value: editedValue }),
      })
      fetchData()
    } catch { /* ignore */ }
    setActionLoading(null)
  }

  // Stale lander actions
  const handleRegenerateLander = async (item: WorkItem) => {
    if (!item.stale_lander) return
    setActionLoading('regenerate_lander')
    try {
      const res = await fetch(`/api/landers/ai-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_id: item.location_id }),
      })
      if (res.ok) removeItem(item.id)
    } catch { /* ignore */ }
    setActionLoading(null)
  }

  const handleDismissLander = async (item: WorkItem) => {
    if (!item.stale_lander) return
    setActionLoading('dismiss_lander')
    try {
      const res = await fetch(`/api/landers/${item.stale_lander.lander_id}/dismiss-stale`, {
        method: 'POST',
      })
      if (res.ok) removeItem(item.id)
    } catch { /* ignore */ }
    setActionLoading(null)
  }

  // Assignment
  const handleAssign = async (item: WorkItem, userId: string | null) => {
    try {
      const res = await fetch('/api/agency/work-queue/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: item.id, item_type: item.type, assigned_to: userId }),
      })
      if (res.ok && data) {
        const newItems = data.items.map((i) =>
          i.id === item.id ? { ...i, assigned_to: userId } : i
        )
        setData({ ...data, items: newItems })
      }
    } catch { /* ignore */ }
  }

  // ─── Derived state ────────────────────────────────────────

  const items = data?.items || []
  const selectedItem = items.find((i) => i.id === selectedId)

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
        <QueueHeader counts={data?.counts} filter={filter} setFilter={setFilter} scope={scope} setScope={setScope} isAgencyAdmin={!!data?.is_agency_admin} itemCount={0} />
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

  // ─── Inbox Mode ───────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col">
      <QueueHeader counts={data?.counts} filter={filter} setFilter={setFilter} scope={scope} setScope={setScope} isAgencyAdmin={!!data?.is_agency_admin} itemCount={items.length} />

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
              <ListItemContent item={item} teamMembers={teamMembers} />
            </button>
          ))}
          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />
          {loadingMore && (
            <div className="py-4 text-center text-xs text-warm-gray animate-pulse">Loading more...</div>
          )}
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
                onApprovePost={() => handleApprovePost(selectedItem)}
                onEditPost={() => handleEditPost(selectedItem)}
                onRejectPost={() => handleRejectPost(selectedItem)}
                onDeletePost={() => handleDeletePost(selectedItem)}
                onDismiss={() => removeItem(selectedItem.id)}
                onApproveRec={(recId, editedValue) => handleApproveRec(selectedItem, recId, editedValue)}
                onApproveBatch={() => handleApproveBatch(selectedItem)}
                onRejectRec={(recId) => handleRejectRec(selectedItem, recId)}
                onEditRec={(recId, editedValue) => handleEditRec(selectedItem, recId, editedValue)}
                onRegenerateLander={() => handleRegenerateLander(selectedItem)}
                onDismissLander={() => handleDismissLander(selectedItem)}
                teamMembers={teamMembers}
                onAssign={(userId) => handleAssign(selectedItem, userId)}
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

function ListItemContent({ item, teamMembers = [] }: { item: WorkItem; teamMembers?: TeamMember[] }) {
  const assignedLabel = item.assigned_to
    ? teamMembers.find((m) => m.id === item.assigned_to)?.email?.split('@')[0] || 'Assigned'
    : null

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
            {assignedLabel && (
              <>
                <span className="text-warm-border">·</span>
                <span className="text-[10px] text-ink/50">{assignedLabel}</span>
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
    const postStatusLabels: Record<string, string> = {
      draft: 'Draft', client_review: 'Client Review', pending: 'Approved',
    }
    return (
      <div className="flex items-start gap-3">
        <PriorityDot priority={item.priority} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-ink truncate">
              Post {postStatusLabels[item.post.status] || 'Pending'}
            </span>
            {item.post.source === 'ai' && (
              <span className="text-[10px] text-violet-600 font-medium">AI</span>
            )}
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
            {assignedLabel && (
              <>
                <span className="text-warm-border">·</span>
                <span className="text-[10px] text-ink/50">{assignedLabel}</span>
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

  if (item.type === 'profile_optimization' && item.profile_optimization) {
    const recCount = item.profile_optimization.recommendations.length
    const fields = item.profile_optimization.recommendations.map((r) => r.field)
    const hasClientReview = item.profile_optimization.recommendations.some((r) => r.status === 'client_review')
    return (
      <div className="flex items-start gap-3">
        <PriorityDot priority={item.priority} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-ink truncate">
              Profile Optimization
            </span>
            <span className="text-[10px] text-violet-600 font-medium">AI</span>
          </div>
          <div className="text-xs text-warm-gray truncate mb-1">
            {item.location_name} · {item.org_name}
          </div>
          <div className="text-xs text-ink/60">
            {recCount} recommendation{recCount !== 1 ? 's' : ''}: {fields.join(', ')}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <TypeBadge type="profile_optimization" />
            {hasClientReview && (
              <>
                <span className="text-warm-border">·</span>
                <span className="text-[10px] text-emerald-600 font-medium">Awaiting client</span>
              </>
            )}
            <span className="text-warm-border">·</span>
            <span className="text-[10px] text-warm-gray">{timeAgo(item.created_at)}</span>
          </div>
        </div>
      </div>
    )
  }

  if (item.type === 'stale_lander' && item.stale_lander) {
    return (
      <div className="flex items-start gap-3">
        <PriorityDot priority={item.priority} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-ink truncate">Stale Lander Content</span>
          </div>
          <div className="text-xs text-warm-gray truncate mb-1">
            {item.location_name} · {item.org_name}
          </div>
          <div className="text-xs text-amber-600">
            AI content needs regeneration
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <TypeBadge type="stale_lander" />
            <span className="text-warm-border">·</span>
            <span className="text-[10px] text-warm-gray">{timeAgo(item.created_at)}</span>
          </div>
        </div>
      </div>
    )
  }

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
      <div className="flex items-start gap-3">
        <PriorityDot priority={item.priority} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-ink truncate">{cit.directory_name}</span>
            {isNotListed && (
              <span className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded font-medium">Not Listed</span>
            )}
          </div>
          <div className="text-xs text-warm-gray truncate mb-1">
            {item.location_name} · {item.org_name}
          </div>
          <div className="text-xs text-teal-700">
            {isNotListed
              ? 'Business not found on this directory'
              : `Incorrect ${issues.join(', ')}`}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <TypeBadge type="citation" />
            <span className="text-warm-border">·</span>
            <span className="text-[10px] text-warm-gray">{timeAgo(item.created_at)}</span>
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
  onApprovePost,
  onEditPost,
  onRejectPost,
  onDeletePost,
  onDismiss,
  onApproveRec,
  onApproveBatch,
  onRejectRec,
  onEditRec,
  onRegenerateLander,
  onDismissLander,
  teamMembers,
  onAssign,
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
  onApprovePost: () => void
  onEditPost: () => void
  onRejectPost: () => void
  onDeletePost: () => void
  onDismiss: () => void
  onApproveRec: (recId: string, editedValue?: unknown) => void
  onApproveBatch: () => void
  onRejectRec: (recId: string) => void
  onEditRec: (recId: string, editedValue: unknown) => void
  onRegenerateLander: () => void
  onDismissLander: () => void
  teamMembers: TeamMember[]
  onAssign: (userId: string | null) => void
}) {
  const assignable = isReviewItem(item) || item.type === 'post_pending'

  return (
    <div>
      {assignable && teamMembers.length > 0 && (
        <AssignDropdown item={item} teamMembers={teamMembers} onAssign={onAssign} />
      )}

      {isReviewItem(item) && item.review && (
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
      )}

      {item.type === 'google_update' && (
        <GoogleUpdateDetail
          item={item}
          actionLoading={actionLoading}
          onAction={onGoogleAction}
        />
      )}

      {item.type === 'post_pending' && item.post && (
        <PostDetail
          item={item}
          editMode={editMode}
          editText={editText}
          setEditMode={setEditMode}
          setEditText={setEditText}
          actionLoading={actionLoading}
          onApprove={onApprovePost}
          onEditPost={onEditPost}
          onReject={onRejectPost}
          onDelete={onDeletePost}
          onDismiss={onDismiss}
        />
      )}

      {item.type === 'sync_error' && item.sync_error && (
        <SyncErrorDetail
          item={item}
          onDismiss={onDismiss}
        />
      )}

      {item.type === 'profile_optimization' && item.profile_optimization && (
        <ProfileOptDetail
          item={item}
          actionLoading={actionLoading}
          onApproveRec={onApproveRec}
          onApproveBatch={onApproveBatch}
          onRejectRec={onRejectRec}
          onEditRec={onEditRec}
        />
      )}

      {item.type === 'stale_lander' && item.stale_lander && (
        <StaleLanderDetail
          item={item}
          actionLoading={actionLoading}
          onRegenerate={onRegenerateLander}
          onDismiss={onDismissLander}
        />
      )}

      {item.type === 'citation' && item.citation && (
        <CitationDetail item={item} />
      )}
    </div>
  )
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
  const autoResolvedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/locations/${item.location_id}/gbp-profile/google-updates`)
        const data = await res.json()
        if (!cancelled) {
          const loadedDiffs: FieldDiff[] = data.diffs || []
          setDiffs(loadedDiffs)
          // Auto-resolve stale items with no actual diffs
          if (loadedDiffs.length === 0 && !autoResolvedRef.current) {
            autoResolvedRef.current = true
            onAction('accept')
          }
        }
      } catch {
        if (!cancelled) setDiffs([])
      }
      if (!cancelled) setLoadingDiffs(false)
    }
    load()
    return () => { cancelled = true }
  }, [item.location_id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loadingDiffs) {
    return (
      <div className="py-8 text-center text-xs text-warm-gray animate-pulse">Checking Google for changes...</div>
    )
  }

  if (!diffs || diffs.length === 0) return null

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
    </div>
  )
}

// ─── Post Detail ────────────────────────────────────────────

function PostDetail({
  item,
  editMode,
  editText,
  setEditMode,
  setEditText,
  actionLoading,
  onApprove,
  onEditPost,
  onReject,
  onDelete,
  onDismiss,
}: {
  item: WorkItem
  editMode: boolean
  editText: string
  setEditMode: (v: boolean) => void
  setEditText: (v: string) => void
  actionLoading: string | null
  onApprove: () => void
  onEditPost: () => void
  onReject: () => void
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
  const isDraft = post.status === 'draft'
  const isClientReview = post.status === 'client_review'
  const isAI = post.source === 'ai'

  const statusLabels: Record<string, { label: string; classes: string }> = {
    draft: { label: 'Draft', classes: 'text-amber-600 bg-amber-50' },
    client_review: { label: 'Client Review', classes: 'text-blue-600 bg-blue-50' },
    pending: { label: 'Approved', classes: 'text-emerald-600 bg-emerald-50' },
  }
  const statusStyle = statusLabels[post.status] || statusLabels.draft

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-warm-light flex items-center justify-center shrink-0">
          <PostIcon className="w-5 h-5 text-ink" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink">
              {isDraft ? 'Post Draft' : isClientReview ? 'Awaiting Client' : 'Scheduled Post'}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${style.classes}`}>
              {style.label}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusStyle.classes}`}>
              {statusStyle.label}
            </span>
            {isAI && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium text-violet-600 bg-violet-50">
                AI Generated
              </span>
            )}
          </div>
          <div className="text-[10px] text-warm-gray mt-0.5">{item.location_name}</div>
        </div>
      </div>

      <div className="text-xs text-warm-gray mb-4">{item.location_name} · {item.org_name}</div>

      {post.media_url && (
        <div className="mb-4">
          <img
            src={post.media_url}
            alt=""
            className="w-full rounded-xl border border-warm-border/50 object-cover"
            style={{ aspectRatio: '4/3' }}
          />
        </div>
      )}

      {!editMode && (
        <div className="bg-warm-light/50 rounded-xl p-4 mb-4 border border-warm-border/50">
          <p className="text-sm text-ink leading-relaxed">{post.summary}</p>
        </div>
      )}

      {editMode && (
        <div className="mb-4">
          <div className="text-[10px] text-warm-gray uppercase tracking-wider font-medium mb-2">Edit Post</div>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={4}
            maxLength={300}
            className="w-full px-4 py-3 border border-warm-border rounded-xl text-sm text-ink outline-none focus:ring-2 focus:ring-ink/20 resize-y placeholder:text-warm-gray"
            autoFocus
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-warm-gray">{editText.length}/300</span>
            <div className="flex items-center gap-2">
              <button onClick={onEditPost} disabled={actionLoading === 'edit_post' || !editText.trim()} className="px-4 py-2 bg-ink hover:bg-ink/90 text-cream text-xs font-medium rounded-full transition-colors disabled:opacity-50">
                {actionLoading === 'edit_post' ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setEditMode(false)} className="px-4 py-2 text-xs text-warm-gray hover:text-ink transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {post.scheduled_for && (
        <div className="text-xs text-warm-gray mb-4">
          Scheduled for{' '}
          {new Date(post.scheduled_for).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
          })}
        </div>
      )}

      {!editMode && (
        <div className="flex items-center gap-2 flex-wrap">
          {isDraft && (
            <button
              onClick={onApprove}
              disabled={actionLoading === 'approve_post'}
              className="px-5 py-2.5 bg-ink hover:bg-ink/90 text-cream text-xs font-medium rounded-full transition-colors disabled:opacity-50"
            >
              {actionLoading === 'approve_post' ? 'Sending...' : 'Approve & Send to Client'}
            </button>
          )}
          <button
            onClick={() => { setEditMode(true); setEditText(post.summary) }}
            className="px-4 py-2.5 border border-warm-border text-xs text-ink rounded-full hover:border-ink transition-colors"
          >
            Edit
          </button>
          <div className="flex-1" />
          {isDraft && (
            <button onClick={onReject} disabled={actionLoading === 'reject_post'} className="px-4 py-2.5 text-xs text-warm-gray hover:text-red-600 transition-colors disabled:opacity-50">
              {actionLoading === 'reject_post' ? 'Rejecting...' : 'Reject'}
            </button>
          )}
          {!isDraft && (
            <button onClick={onDismiss} className="px-4 py-2.5 text-xs text-warm-gray hover:text-ink transition-colors">
              Dismiss
            </button>
          )}
        </div>
      )}
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

// ─── Profile Optimization Detail ─────────────────────────────

function ProfileOptDetail({
  item,
  actionLoading,
  onApproveRec,
  onApproveBatch,
  onRejectRec,
  onEditRec,
}: {
  item: WorkItem
  actionLoading: string | null
  onApproveRec: (recId: string, editedValue?: unknown) => void
  onApproveBatch: () => void
  onRejectRec: (recId: string) => void
  onEditRec: (recId: string, editedValue: unknown) => void
}) {
  const opt = item.profile_optimization!
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const pendingRecs = opt.recommendations.filter((r) => r.status === 'pending')
  const clientReviewRecs = opt.recommendations.filter((r) => r.status === 'client_review')

  const fieldLabels: Record<string, string> = {
    description: 'Business Description',
    categories: 'Additional Categories',
    attributes: 'Business Attributes',
    hours: 'Business Hours',
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
          <OptimizeIcon className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <div className="text-base font-medium text-ink">Profile Optimization</div>
          <div className="text-xs text-warm-gray">{item.location_name} · {item.org_name}</div>
        </div>
      </div>

      {pendingRecs.length > 0 && (
        <>
          <div className="text-[11px] text-warm-gray uppercase tracking-wider font-medium mb-3">
            Pending Review ({pendingRecs.length})
          </div>

          {pendingRecs.map((rec) => (
            <div key={rec.id} className="bg-warm-light rounded-xl p-4 mb-3 border border-warm-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-ink">{fieldLabels[rec.field] || rec.field}</span>
                {rec.requires_client_approval && (
                  <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Needs client approval</span>
                )}
              </div>

              {rec.ai_rationale && (
                <p className="text-xs text-warm-gray mb-3">{rec.ai_rationale}</p>
              )}

              {rec.field === 'description' && (
                <div className="mb-3">
                  {rec.current_value != null && (
                    <div className="mb-2">
                      <div className="text-[10px] text-warm-gray uppercase tracking-wider mb-1">Current</div>
                      <p className="text-xs text-ink/60 leading-relaxed">{String(rec.current_value)}</p>
                    </div>
                  )}
                  <div>
                    <div className="text-[10px] text-emerald-600 uppercase tracking-wider mb-1">Proposed</div>
                    {editingId === rec.id ? (
                      <div>
                        <textarea
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-full text-xs text-ink leading-relaxed p-3 border border-warm-border rounded-lg bg-white resize-none focus:outline-none focus:border-ink"
                          rows={6}
                        />
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[10px] text-warm-gray font-mono">{editValue.length} chars</span>
                          <div className="flex-1" />
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs text-warm-gray hover:text-ink transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              onEditRec(rec.id, editValue)
                              setEditingId(null)
                            }}
                            className="px-3 py-1.5 text-xs bg-ink text-cream rounded-full hover:bg-ink/80 transition-colors"
                          >
                            Save Edit
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-ink leading-relaxed">
                        {String(rec.edited_value || rec.proposed_value)}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {rec.field === 'categories' && (
                <div className="mb-3">
                  <div className="text-[10px] text-emerald-600 uppercase tracking-wider mb-1">Suggested Categories</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(rec.proposed_value as string[] || []).map((cat, i) => (
                      <span key={i} className="text-xs bg-white border border-warm-border rounded-full px-2.5 py-1 text-ink">
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {rec.field === 'hours' && (
                <div className="mb-3">
                  <p className="text-xs text-ink">Business hours need to be set manually.</p>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2 border-t border-warm-border/50">
                {rec.field !== 'hours' && (
                  <button
                    onClick={() => onApproveRec(rec.id, rec.edited_value || undefined)}
                    disabled={actionLoading === `approve_rec_${rec.id}`}
                    className="px-3 py-1.5 text-xs bg-ink text-cream rounded-full hover:bg-ink/80 transition-colors disabled:opacity-50"
                  >
                    {actionLoading === `approve_rec_${rec.id}` ? 'Approving...' : (rec.requires_client_approval ? 'Approve & Send to Client' : 'Approve & Apply')}
                  </button>
                )}
                {rec.field === 'description' && editingId !== rec.id && (
                  <button
                    onClick={() => {
                      setEditingId(rec.id)
                      setEditValue(String(rec.edited_value || rec.proposed_value || ''))
                    }}
                    className="px-3 py-1.5 text-xs border border-warm-border text-ink rounded-full hover:border-ink transition-colors"
                  >
                    Edit
                  </button>
                )}
                <button
                  onClick={() => onRejectRec(rec.id)}
                  disabled={actionLoading === `reject_rec_${rec.id}`}
                  className="px-3 py-1.5 text-xs text-warm-gray hover:text-red-600 transition-colors disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}

          {pendingRecs.length > 1 && (
            <button
              onClick={onApproveBatch}
              disabled={actionLoading === 'approve_batch'}
              className="w-full py-2.5 text-xs bg-ink text-cream rounded-full hover:bg-ink/80 transition-colors disabled:opacity-50 mb-4"
            >
              {actionLoading === 'approve_batch' ? 'Approving all...' : `Approve All ${pendingRecs.length} Recommendations`}
            </button>
          )}
        </>
      )}

      {clientReviewRecs.length > 0 && (
        <>
          <div className="text-[11px] text-emerald-600 uppercase tracking-wider font-medium mb-3 mt-4">
            Awaiting Client Approval ({clientReviewRecs.length})
          </div>
          {clientReviewRecs.map((rec) => (
            <div key={rec.id} className="bg-emerald-50 rounded-xl p-4 mb-3 border border-emerald-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-ink">{fieldLabels[rec.field] || rec.field}</span>
                <span className="text-[10px] text-emerald-600 font-medium">Sent to client</span>
              </div>
              <p className="text-xs text-ink/60 leading-relaxed">
                {String(rec.edited_value || rec.proposed_value)}
              </p>
            </div>
          ))}
        </>
      )}

      <a
        href={`/admin/${item.org_slug}/locations/${item.location_id}/gbp-profile`}
        className="inline-block mt-2 px-4 py-2.5 border border-warm-border text-xs text-ink rounded-full hover:border-ink transition-colors no-underline"
      >
        View Full Profile
      </a>
    </div>
  )
}

// ─── Citation Detail ─────────────────────────────────────────

function CitationDetail({ item }: { item: WorkItem }) {
  const cit = item.citation!
  const isNotListed = cit.status === 'not_listed'

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink">{cit.directory_name}</span>
            {isNotListed && (
              <span className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded font-medium">Not Listed</span>
            )}
          </div>
          <div className="text-[10px] text-warm-gray mt-0.5">{item.location_name} · {item.org_name}</div>
        </div>
      </div>

      {isNotListed ? (
        <div className="bg-red-50 rounded-xl p-4 mb-4 border border-red-200">
          <div className="text-[10px] text-red-600 uppercase tracking-wider font-medium mb-2">Not Listed</div>
          <p className="text-sm text-ink leading-relaxed">
            This business was not found on {cit.directory_name}. Submitting a listing will improve citation coverage and local search visibility.
          </p>
        </div>
      ) : (
        <div className="space-y-3 mb-4">
          <div className="text-[10px] text-warm-gray uppercase tracking-wider font-medium">NAP Mismatches</div>
          {!cit.name_match && (
            <div className="bg-teal-50 rounded-lg p-3 border border-teal-200">
              <div className="text-[10px] text-teal-700 font-medium mb-1">Business Name</div>
              <div className="text-xs text-ink/60 line-through">{cit.found_name || 'Not found'}</div>
            </div>
          )}
          {!cit.address_match && (
            <div className="bg-teal-50 rounded-lg p-3 border border-teal-200">
              <div className="text-[10px] text-teal-700 font-medium mb-1">Address</div>
              <div className="text-xs text-ink/60 line-through">{cit.found_address || 'Not found'}</div>
            </div>
          )}
          {!cit.phone_match && (
            <div className="bg-teal-50 rounded-lg p-3 border border-teal-200">
              <div className="text-[10px] text-teal-700 font-medium mb-1">Phone</div>
              <div className="text-xs text-ink/60 line-through">{cit.found_phone || 'Not found'}</div>
            </div>
          )}
        </div>
      )}

      {cit.ai_recommendation && (
        <div className="text-xs text-warm-gray mb-4">{cit.ai_recommendation}</div>
      )}

      <div className="flex items-center gap-2">
        {cit.listing_url && (
          <a
            href={cit.listing_url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2.5 border border-warm-border text-xs text-ink rounded-full hover:border-ink transition-colors no-underline"
          >
            View Listing
          </a>
        )}
        {cit.directory_url && !cit.listing_url && (
          <a
            href={cit.directory_url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2.5 border border-warm-border text-xs text-ink rounded-full hover:border-ink transition-colors no-underline"
          >
            Visit Directory
          </a>
        )}
      </div>
    </div>
  )
}

// ─── Stale Lander Detail ─────────────────────────────────────

function StaleLanderDetail({
  item,
  actionLoading,
  onRegenerate,
  onDismiss,
}: {
  item: WorkItem
  actionLoading: string | null
  onRegenerate: () => void
  onDismiss: () => void
}) {
  const lander = item.stale_lander!
  const landerUrl = `/l/${lander.slug}`

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
          <LanderIcon className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink">Stale Lander Content</span>
            <PriorityBadge priority="important" />
          </div>
          <div className="text-[10px] text-warm-gray mt-0.5">{item.location_name}</div>
        </div>
      </div>

      <div className="text-xs text-warm-gray mb-4">{item.location_name} · {item.org_name}</div>

      <div className="bg-amber-50 rounded-xl p-4 mb-4 border border-amber-200">
        <div className="text-[10px] text-amber-600 uppercase tracking-wider font-medium mb-2">Content Outdated</div>
        <p className="text-sm text-ink leading-relaxed">
          The GBP profile for this location has been updated since the lander content was last generated.
          Regenerate to keep the landing page accurate and aligned with the latest business information.
        </p>
      </div>

      <div className="text-xs text-warm-gray mb-4">
        Landing page: <a href={landerUrl} target="_blank" rel="noopener noreferrer" className="text-ink underline">{landerUrl}</a>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onRegenerate}
          disabled={actionLoading === 'regenerate_lander'}
          className="px-5 py-2.5 bg-ink hover:bg-ink/90 text-cream text-xs font-medium rounded-full transition-colors disabled:opacity-50"
        >
          {actionLoading === 'regenerate_lander' ? 'Regenerating...' : 'Regenerate Content'}
        </button>
        <a
          href={`/admin/${item.org_slug}/locations/${item.location_id}/lander`}
          className="px-4 py-2.5 border border-warm-border text-xs text-ink rounded-full hover:border-ink transition-colors no-underline"
        >
          View Lander
        </a>
        <div className="flex-1" />
        <button
          onClick={onDismiss}
          disabled={actionLoading === 'dismiss_lander'}
          className="px-4 py-2.5 text-xs text-warm-gray hover:text-ink transition-colors disabled:opacity-50"
        >
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
  scope,
  setScope,
  isAgencyAdmin,
  itemCount,
}: {
  counts?: WorkQueueData['counts'] | null
  filter: FilterType
  setFilter: (f: FilterType) => void
  scope: ScopeType
  setScope: (s: ScopeType) => void
  isAgencyAdmin: boolean
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
        {isAgencyAdmin && (
          <div className="flex rounded-full border border-warm-border overflow-hidden">
            <button
              onClick={() => setScope('all')}
              className={`px-3 py-1.5 text-xs transition-colors ${
                scope === 'all' ? 'bg-ink text-cream' : 'text-warm-gray hover:text-ink'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setScope('mine')}
              className={`px-3 py-1.5 text-xs transition-colors ${
                scope === 'mine' ? 'bg-ink text-cream' : 'text-warm-gray hover:text-ink'
              }`}
            >
              My Queue
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto">
        <FilterTab active={filter === 'all'} onClick={() => setFilter('all')} label="All" count={counts?.total} />
        <FilterTab active={filter === 'needs_reply'} onClick={() => setFilter('needs_reply')} label="Reviews" count={(counts?.needs_reply || 0) + (counts?.ai_drafts || 0)} />
        <FilterTab active={filter === 'google_updates'} onClick={() => setFilter('google_updates')} label="Profiles" count={counts?.google_updates} />
        <FilterTab active={filter === 'posts'} onClick={() => setFilter('posts')} label="Posts" count={counts?.posts} />
        <FilterTab active={filter === 'profile_optimizations'} onClick={() => setFilter('profile_optimizations')} label="Optimize" count={counts?.profile_optimizations} />
        <FilterTab active={filter === 'stale_landers'} onClick={() => setFilter('stale_landers')} label="Landers" count={counts?.stale_landers} />
        <FilterTab active={filter === 'citations'} onClick={() => setFilter('citations')} label="Citations" count={counts?.citations} />
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

function AssignDropdown({
  item,
  teamMembers,
  onAssign,
}: {
  item: WorkItem
  teamMembers: TeamMember[]
  onAssign: (userId: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const assigned = teamMembers.find((m) => m.id === item.assigned_to)

  return (
    <div className="relative mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11px] text-warm-gray hover:text-ink transition-colors"
      >
        <UserIcon className="w-3.5 h-3.5" />
        {assigned ? assigned.email.split('@')[0] : 'Assign'}
        <ChevronIcon className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 bg-white border border-warm-border rounded-lg shadow-lg py-1 min-w-[180px]">
          {item.assigned_to && (
            <button
              onClick={() => { onAssign(null); setOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-xs text-warm-gray hover:bg-warm-light transition-colors"
            >
              Unassign
            </button>
          )}
          {teamMembers.map((m) => (
            <button
              key={m.id}
              onClick={() => { onAssign(m.id); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                m.id === item.assigned_to ? 'text-ink font-medium bg-warm-light' : 'text-ink hover:bg-warm-light'
              }`}
            >
              {m.email.split('@')[0]}
              <span className="text-warm-gray ml-1">({m.email})</span>
            </button>
          ))}
        </div>
      )}
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
    profile_optimization: { label: 'Optimize', classes: 'text-violet-600 bg-violet-50' },
    stale_lander: { label: 'Lander', classes: 'text-amber-600 bg-amber-50' },
    citation: { label: 'Citation', classes: 'text-teal-600 bg-teal-50' },
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

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function OptimizeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20V10" />
      <path d="M18 20V4" />
      <path d="M6 20v-4" />
    </svg>
  )
}

function LanderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <path d="M2 10h20" />
    </svg>
  )
}
