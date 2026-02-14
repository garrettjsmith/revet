'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ─── Types (same as v1) ──────────────────────────────────────

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

type WorkItemType = 'review_reply' | 'ai_draft_review' | 'google_update' | 'post_pending' | 'sync_error' | 'profile_optimization' | 'stale_lander'

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
  }
  has_more?: boolean
  offset?: number
  scope?: 'all' | 'mine'
  is_agency_admin?: boolean
}

type FilterType = 'all' | 'needs_reply' | 'ai_drafts' | 'google_updates' | 'posts' | 'sync_errors' | 'profile_optimizations' | 'stale_landers'
type ScopeType = 'all' | 'mine'

interface TeamMember {
  id: string
  email: string
}

// ─── Grouping Types ──────────────────────────────────────────

type GroupedType = 'reviews' | 'google_updates' | 'posts' | 'optimizations' | 'sync_errors' | 'stale_landers'

interface TypeGroup {
  key: GroupedType
  label: string
  items: WorkItem[]
  priority: 'urgent' | 'important' | 'info'
  batchable: boolean
}

interface OrgGroup {
  org_name: string
  org_slug: string
  types: TypeGroup[]
  totalCount: number
  highestPriority: 'urgent' | 'important' | 'info'
}

// ─── Grouping Logic ──────────────────────────────────────────

const TYPE_MAP: Record<WorkItemType, GroupedType> = {
  review_reply: 'reviews',
  ai_draft_review: 'reviews',
  google_update: 'google_updates',
  post_pending: 'posts',
  sync_error: 'sync_errors',
  profile_optimization: 'optimizations',
  stale_lander: 'stale_landers',
}

const TYPE_LABELS: Record<GroupedType, string> = {
  reviews: 'Reviews',
  google_updates: 'Google Updates',
  posts: 'Posts',
  optimizations: 'Profile Optimizations',
  sync_errors: 'Sync Errors',
  stale_landers: 'Stale Landers',
}

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, important: 1, info: 2 }

const BATCHABLE = new Set<GroupedType>(['optimizations', 'posts', 'stale_landers'])

function getHighestPriority(items: WorkItem[]): 'urgent' | 'important' | 'info' {
  let best: 'urgent' | 'important' | 'info' = 'info'
  for (const item of items) {
    if (item.priority === 'urgent') return 'urgent'
    if (item.priority === 'important') best = 'important'
  }
  return best
}

function groupItems(items: WorkItem[]): OrgGroup[] {
  const orgMap = new Map<string, Map<GroupedType, WorkItem[]>>()

  for (const item of items) {
    const orgKey = item.org_name
    const typeKey = TYPE_MAP[item.type]

    if (!orgMap.has(orgKey)) orgMap.set(orgKey, new Map())
    const types = orgMap.get(orgKey)!
    if (!types.has(typeKey)) types.set(typeKey, [])
    types.get(typeKey)!.push(item)
  }

  const groups: OrgGroup[] = []
  orgMap.forEach((typeMap, orgName) => {
    const types: TypeGroup[] = []
    let orgSlug = ''

    typeMap.forEach((typeItems, typeKey) => {
      if (!orgSlug && typeItems[0]) orgSlug = typeItems[0].org_slug
      types.push({
        key: typeKey,
        label: TYPE_LABELS[typeKey] || typeKey,
        items: typeItems,
        priority: getHighestPriority(typeItems),
        batchable: BATCHABLE.has(typeKey),
      })
    })

    types.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])

    groups.push({
      org_name: orgName,
      org_slug: orgSlug,
      types,
      totalCount: types.reduce((sum, t) => sum + t.items.length, 0),
      highestPriority: types[0]?.priority || 'info',
    })
  })

  groups.sort((a, b) => {
    const pDiff = PRIORITY_ORDER[a.highestPriority] - PRIORITY_ORDER[b.highestPriority]
    if (pDiff !== 0) return pDiff
    return b.totalCount - a.totalCount
  })

  return groups
}

// ─── Main Component ──────────────────────────────────────────

export function WorkQueueV2() {
  const [data, setData] = useState<WorkQueueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [filter, setFilter] = useState<FilterType>('all')
  const [scope, setScope] = useState<ScopeType>('all')
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editText, setEditText] = useState('')
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const sentinelRef = useRef<HTMLDivElement>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/agency/work-queue?filter=${filter}&scope=${scope}&limit=100`)
      if (res.ok) {
        const newData: WorkQueueData = await res.json()
        setData(newData)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [filter, scope])

  const fetchMore = useCallback(async () => {
    if (!data?.has_more || loadingMore) return
    setLoadingMore(true)
    try {
      const offset = data.items.length
      const res = await fetch(`/api/agency/work-queue?filter=${filter}&scope=${scope}&offset=${offset}&limit=100`)
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

  useEffect(() => {
    fetch('/api/agency/members')
      .then((res) => res.ok ? res.json() : { members: [] })
      .then((data) => setTeamMembers(data.members || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) fetchMore() },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [fetchMore])

  // ─── Actions (same as v1) ─────────────────────────────────

  const removeItem = (itemId: string) => {
    if (!data) return
    const newItems = data.items.filter((i) => i.id !== itemId)
    setData({ ...data, items: newItems, counts: { ...data.counts, total: newItems.length } })

    // If item was selected, clear selection
    if (selectedItemId === itemId) {
      setSelectedItemId(null)
    }
    setEditMode(false)
  }

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

  // Batch approve all items in a type group
  const handleBatchApproveGroup = async (typeGroup: TypeGroup) => {
    setActionLoading('batch_group')
    try {
      for (const item of typeGroup.items) {
        if (typeGroup.key === 'optimizations' && item.profile_optimization) {
          const firstRec = item.profile_optimization.recommendations[0]
          if (firstRec) {
            await fetch(`/api/locations/${item.location_id}/recommendations`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'approve_batch',
                recommendation_id: firstRec.id,
                batch_id: item.profile_optimization.batch_id,
              }),
            })
          }
        }
        if (typeGroup.key === 'posts' && item.post?.status === 'draft') {
          await fetch(`/api/posts/${item.post.id}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'agency_approve' }),
          })
        }
        if (typeGroup.key === 'stale_landers' && item.stale_lander) {
          await fetch(`/api/landers/ai-content`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ location_id: item.location_id }),
          })
        }
      }
    } catch { /* ignore */ }
    setActionLoading(null)
    setSelectedGroupKey(null)
    setSelectedItemId(null)
    fetchData()
  }

  // ─── Derived state ─────────────────────────────────────────

  const items = data?.items || []
  const groups = groupItems(items)

  // Filter groups to match selected filter
  const filteredGroups = filter === 'all'
    ? groups
    : groups
        .map((org) => ({
          ...org,
          types: org.types.filter((t) => filterMatchesGroupedType(filter, t.key)),
          totalCount: org.types
            .filter((t) => filterMatchesGroupedType(filter, t.key))
            .reduce((sum, t) => sum + t.items.length, 0),
        }))
        .filter((org) => org.types.length > 0)

  // Find selected group and item
  const selectedGroup = selectedGroupKey
    ? findGroup(filteredGroups, selectedGroupKey)
    : null
  const selectedItem = selectedItemId
    ? items.find((i) => i.id === selectedItemId)
    : null

  // ─── Loading ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-pulse text-sm text-warm-gray">Loading queue...</div>
      </div>
    )
  }

  // ─── Empty ─────────────────────────────────────────────────

  if (items.length === 0) {
    return (
      <div className="h-screen flex flex-col">
        <V2Header counts={data?.counts} filter={filter} setFilter={setFilter} scope={scope} setScope={setScope} isAgencyAdmin={!!data?.is_agency_admin} />
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

  // ─── Main Layout ───────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col">
      <V2Header
        counts={data?.counts}
        filter={filter}
        setFilter={setFilter}
        scope={scope}
        setScope={setScope}
        isAgencyAdmin={!!data?.is_agency_admin}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Grouped List */}
        <div className={`w-full lg:w-[360px] lg:border-r lg:border-warm-border overflow-y-auto ${mobileDetailOpen ? 'hidden lg:block' : ''}`}>
          {filteredGroups.map((org) => (
            <div key={org.org_name}>
              {/* Org header */}
              <div className="px-5 pt-4 pb-2 border-b border-warm-border/30">
                <div className="flex items-center gap-2">
                  <PriorityDot priority={org.highestPriority} />
                  <span className="text-xs font-medium text-ink">{org.org_name}</span>
                  <span className="text-[10px] text-warm-gray">{org.totalCount}</span>
                </div>
              </div>

              {/* Type rows */}
              {org.types.map((typeGroup) => {
                const groupKey = `${org.org_name}__${typeGroup.key}`
                const isSelected = selectedGroupKey === groupKey && !selectedItemId

                return (
                  <button
                    key={groupKey}
                    onClick={() => {
                      setSelectedGroupKey(groupKey)
                      setSelectedItemId(null)
                      setEditMode(false)
                      setMobileDetailOpen(true)
                    }}
                    className={`w-full text-left px-5 py-3 border-b border-warm-border/30 transition-colors ${
                      isSelected ? 'bg-warm-light' : 'hover:bg-warm-light/50'
                    }`}
                  >
                    <div className="flex items-center justify-between pl-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <TypeIcon type={typeGroup.key} />
                        <span className="text-sm text-ink truncate">{typeGroup.label}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs font-mono ${
                          typeGroup.priority === 'urgent' ? 'text-red-500' :
                          typeGroup.priority === 'important' ? 'text-amber-500' :
                          'text-warm-gray'
                        }`}>
                          {typeGroup.items.length}
                        </span>
                        {typeGroup.batchable && (
                          <span className="text-[9px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">batch</span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          ))}
          <div ref={sentinelRef} className="h-1" />
          {loadingMore && (
            <div className="py-4 text-center text-xs text-warm-gray animate-pulse">Loading more...</div>
          )}
        </div>

        {/* Right Panel: Batch View or Item Detail */}
        <div className={`flex-1 overflow-y-auto ${!mobileDetailOpen ? 'hidden lg:block' : ''}`}>
          {selectedItem ? (
            <div className="p-6">
              <button
                onClick={() => { setSelectedItemId(null); setEditMode(false) }}
                className="flex items-center gap-1.5 text-xs text-warm-gray mb-4 hover:text-ink transition-colors"
              >
                <BackIcon className="w-3.5 h-3.5" />
                Back to batch
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
          ) : selectedGroup ? (
            <BatchView
              group={selectedGroup.group}
              typeGroup={selectedGroup.typeGroup}
              actionLoading={actionLoading}
              onSelectItem={(itemId) => { setSelectedItemId(itemId); setEditMode(false) }}
              onBatchApprove={() => handleBatchApproveGroup(selectedGroup.typeGroup)}
              onMobileBack={() => setMobileDetailOpen(false)}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-sm text-warm-gray">Select a group from the list</div>
                <div className="text-xs text-warm-gray/60 mt-1">Items are grouped by customer and type</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── V2 Header ───────────────────────────────────────────────

function V2Header({
  counts,
  filter,
  setFilter,
  scope,
  setScope,
  isAgencyAdmin,
}: {
  counts?: WorkQueueData['counts'] | null
  filter: FilterType
  setFilter: (f: FilterType) => void
  scope: ScopeType
  setScope: (s: ScopeType) => void
  isAgencyAdmin: boolean
}) {
  const reviewCount = (counts?.needs_reply || 0) + (counts?.ai_drafts || 0)
  const total = counts?.total || 0

  return (
    <div className="px-6 py-4 border-b border-warm-border">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-lg font-serif text-ink">Work Queue</h1>
          {total > 0 && (
            <div className="text-xs text-warm-gray mt-0.5">{total} items</div>
          )}
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

      {/* Summary chips */}
      <div className="flex gap-2 overflow-x-auto">
        <SummaryChip
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          label="All"
          count={total}
        />
        {reviewCount > 0 && (
          <SummaryChip
            active={filter === 'needs_reply' || filter === 'ai_drafts'}
            onClick={() => setFilter('needs_reply')}
            label="Reviews"
            count={reviewCount}
            urgent={counts?.needs_reply ? counts.needs_reply > 0 : false}
          />
        )}
        {(counts?.profile_optimizations || 0) > 0 && (
          <SummaryChip
            active={filter === 'profile_optimizations'}
            onClick={() => setFilter('profile_optimizations')}
            label="Optimizations"
            count={counts?.profile_optimizations || 0}
          />
        )}
        {(counts?.posts || 0) > 0 && (
          <SummaryChip
            active={filter === 'posts'}
            onClick={() => setFilter('posts')}
            label="Posts"
            count={counts?.posts || 0}
          />
        )}
        {(counts?.google_updates || 0) > 0 && (
          <SummaryChip
            active={filter === 'google_updates'}
            onClick={() => setFilter('google_updates')}
            label="Google Updates"
            count={counts?.google_updates || 0}
            urgent
          />
        )}
        {(counts?.stale_landers || 0) > 0 && (
          <SummaryChip
            active={filter === 'stale_landers'}
            onClick={() => setFilter('stale_landers')}
            label="Landers"
            count={counts?.stale_landers || 0}
          />
        )}
        {(counts?.sync_errors || 0) > 0 && (
          <SummaryChip
            active={filter === 'sync_errors'}
            onClick={() => setFilter('sync_errors')}
            label="Errors"
            count={counts?.sync_errors || 0}
            urgent
          />
        )}
      </div>
    </div>
  )
}

function SummaryChip({
  active,
  onClick,
  label,
  count,
  urgent,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
  urgent?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors ${
        active
          ? 'bg-ink text-cream'
          : urgent
          ? 'bg-red-50 text-red-600 hover:bg-red-100'
          : 'bg-warm-light text-warm-gray hover:text-ink'
      }`}
    >
      {label}
      <span className={`font-mono ${active ? 'text-cream/70' : ''}`}>{count}</span>
    </button>
  )
}

// ─── Batch View ──────────────────────────────────────────────

function BatchView({
  group,
  typeGroup,
  actionLoading,
  onSelectItem,
  onBatchApprove,
  onMobileBack,
}: {
  group: OrgGroup
  typeGroup: TypeGroup
  actionLoading: string | null
  onSelectItem: (itemId: string) => void
  onBatchApprove: () => void
  onMobileBack: () => void
}) {
  const isBatching = actionLoading === 'batch_group'

  return (
    <div className="p-6">
      <button
        onClick={onMobileBack}
        className="lg:hidden flex items-center gap-1.5 text-xs text-warm-gray mb-4 hover:text-ink transition-colors"
      >
        <BackIcon className="w-3.5 h-3.5" />
        Back to list
      </button>

      {/* Batch header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-base font-serif text-ink">{group.org_name}</h2>
          <div className="text-xs text-warm-gray mt-0.5">
            {typeGroup.label} · {typeGroup.items.length} location{typeGroup.items.length !== 1 ? 's' : ''}
          </div>
        </div>
        {typeGroup.batchable && (
          <button
            onClick={onBatchApprove}
            disabled={isBatching}
            className="px-5 py-2.5 bg-ink hover:bg-ink/90 text-cream text-xs font-medium rounded-full transition-colors disabled:opacity-50 shrink-0"
          >
            {isBatching ? 'Approving all...' : `Approve All ${typeGroup.items.length}`}
          </button>
        )}
      </div>

      {/* Item list within batch */}
      <div className="space-y-2">
        {typeGroup.items.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelectItem(item.id)}
            className="w-full text-left bg-warm-light/50 hover:bg-warm-light border border-warm-border/50 rounded-xl px-4 py-3 transition-colors"
          >
            <BatchItemPreview item={item} />
          </button>
        ))}
      </div>
    </div>
  )
}

function BatchItemPreview({ item }: { item: WorkItem }) {
  if (isReviewItem(item) && item.review) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-0.5 shrink-0">
          {item.review.rating !== null && (
            <span className="text-xs">{renderStarsCompact(item.review.rating)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink truncate">{item.review.reviewer_name || 'Anonymous'}</span>
            {item.review.ai_draft && <span className="text-[10px] text-amber-600 font-medium shrink-0">Draft ready</span>}
          </div>
          <div className="text-xs text-warm-gray truncate mt-0.5">{item.location_name}</div>
          {item.review.body && (
            <div className="text-xs text-ink/50 truncate mt-0.5">{item.review.body}</div>
          )}
        </div>
        <ArrowIcon className="w-4 h-4 text-warm-border shrink-0" />
      </div>
    )
  }

  if (item.type === 'post_pending' && item.post) {
    return (
      <div className="flex items-center gap-3">
        {item.post.media_url && (
          <img src={item.post.media_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink truncate">{item.location_name}</span>
            {item.post.source === 'ai' && <span className="text-[10px] text-violet-600 font-medium shrink-0">AI</span>}
          </div>
          <div className="text-xs text-ink/50 truncate mt-0.5">{item.post.summary}</div>
          {item.post.scheduled_for && (
            <div className="text-[10px] text-warm-gray mt-0.5">
              {new Date(item.post.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          )}
        </div>
        <ArrowIcon className="w-4 h-4 text-warm-border shrink-0" />
      </div>
    )
  }

  if (item.type === 'profile_optimization' && item.profile_optimization) {
    const recCount = item.profile_optimization.recommendations.length
    const fields = item.profile_optimization.recommendations.map((r) => r.field)
    return (
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <span className="text-sm text-ink">{item.location_name}</span>
          <div className="text-xs text-warm-gray mt-0.5">
            {recCount} rec{recCount !== 1 ? 's' : ''}: {fields.join(', ')}
          </div>
        </div>
        <ArrowIcon className="w-4 h-4 text-warm-border shrink-0" />
      </div>
    )
  }

  if (item.type === 'google_update') {
    return (
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <span className="text-sm text-ink">{item.location_name}</span>
          <div className="text-xs text-blue-600 mt-0.5">Pending Google changes</div>
        </div>
        <ArrowIcon className="w-4 h-4 text-warm-border shrink-0" />
      </div>
    )
  }

  if (item.type === 'sync_error' && item.sync_error) {
    return (
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <span className="text-sm text-ink">{item.location_name}</span>
          <div className="text-xs text-red-500 truncate mt-0.5">
            {item.sync_error.sync_error || `${item.sync_error.platform} sync failed`}
          </div>
        </div>
        <ArrowIcon className="w-4 h-4 text-warm-border shrink-0" />
      </div>
    )
  }

  if (item.type === 'stale_lander') {
    return (
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <span className="text-sm text-ink">{item.location_name}</span>
          <div className="text-xs text-amber-600 mt-0.5">Content needs regeneration</div>
        </div>
        <ArrowIcon className="w-4 h-4 text-warm-border shrink-0" />
      </div>
    )
  }

  return null
}

// ─── Item Detail (from v1) ───────────────────────────────────

function ItemDetail({
  item, editMode, editText, setEditMode, setEditText, actionLoading,
  onApproveReview, onEditAndSendReview, onRegenerateReview, onSkipReview, onRejectReview,
  onGoogleAction, onApprovePost, onEditPost, onRejectPost, onDeletePost, onDismiss,
  onApproveRec, onApproveBatch, onRejectRec, onEditRec,
  onRegenerateLander, onDismissLander, teamMembers, onAssign,
}: {
  item: WorkItem; editMode: boolean; editText: string; setEditMode: (v: boolean) => void; setEditText: (v: string) => void; actionLoading: string | null
  onApproveReview: () => void; onEditAndSendReview: () => void; onRegenerateReview: () => void; onSkipReview: () => void; onRejectReview: () => void
  onGoogleAction: (action: 'accept' | 'reject') => void; onApprovePost: () => void; onEditPost: () => void; onRejectPost: () => void; onDeletePost: () => void; onDismiss: () => void
  onApproveRec: (recId: string, editedValue?: unknown) => void; onApproveBatch: () => void; onRejectRec: (recId: string) => void; onEditRec: (recId: string, editedValue: unknown) => void
  onRegenerateLander: () => void; onDismissLander: () => void; teamMembers: TeamMember[]; onAssign: (userId: string | null) => void
}) {
  const assignable = isReviewItem(item) || item.type === 'post_pending'
  return (
    <div>
      {assignable && teamMembers.length > 0 && <AssignDropdown item={item} teamMembers={teamMembers} onAssign={onAssign} />}
      {isReviewItem(item) && item.review && <ReviewDetail item={item} editMode={editMode} editText={editText} setEditMode={setEditMode} setEditText={setEditText} actionLoading={actionLoading} onApprove={onApproveReview} onEditAndSend={onEditAndSendReview} onRegenerate={onRegenerateReview} onSkip={onSkipReview} onReject={onRejectReview} />}
      {item.type === 'google_update' && <GoogleUpdateDetail item={item} actionLoading={actionLoading} onAction={onGoogleAction} />}
      {item.type === 'post_pending' && item.post && <PostDetail item={item} editMode={editMode} editText={editText} setEditMode={setEditMode} setEditText={setEditText} actionLoading={actionLoading} onApprove={onApprovePost} onEditPost={onEditPost} onReject={onRejectPost} onDelete={onDeletePost} onDismiss={onDismiss} />}
      {item.type === 'sync_error' && item.sync_error && <SyncErrorDetail item={item} onDismiss={onDismiss} />}
      {item.type === 'profile_optimization' && item.profile_optimization && <ProfileOptDetail item={item} actionLoading={actionLoading} onApproveRec={onApproveRec} onApproveBatch={onApproveBatch} onRejectRec={onRejectRec} onEditRec={onEditRec} />}
      {item.type === 'stale_lander' && item.stale_lander && <StaleLanderDetail item={item} actionLoading={actionLoading} onRegenerate={onRegenerateLander} onDismiss={onDismissLander} />}
    </div>
  )
}

// ─── Review Detail ───────────────────────────────────────────

function ReviewDetail({ item, editMode, editText, setEditMode, setEditText, actionLoading, onApprove, onEditAndSend, onRegenerate, onSkip, onReject }: { item: WorkItem; editMode: boolean; editText: string; setEditMode: (v: boolean) => void; setEditText: (v: string) => void; actionLoading: string | null; onApprove: () => void; onEditAndSend: () => void; onRegenerate: () => void; onSkip: () => void; onReject: () => void }) {
  const review = item.review!
  const isNegative = review.rating !== null && review.rating <= 2
  return (
    <div>
      <div className="flex items-start gap-3 mb-4">
        {review.reviewer_photo_url ? (
          <img src={review.reviewer_photo_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-ink flex items-center justify-center text-cream text-xs font-bold font-mono shrink-0">{(review.reviewer_name || 'A')[0].toUpperCase()}</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink">{review.reviewer_name || 'Anonymous'}</span>
            <PriorityBadge priority={item.priority} />
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-warm-gray font-mono capitalize">{review.platform}</span>
            <span className="text-warm-border">·</span>
            <span className="text-[10px] text-warm-gray">{new Date(review.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </div>
        {review.rating !== null && (
          <div className="flex items-center gap-0.5 shrink-0">
            {[1, 2, 3, 4, 5].map((star) => (<span key={star} className={`text-sm ${star <= review.rating! ? 'text-amber-400' : 'text-warm-border'}`}>★</span>))}
          </div>
        )}
      </div>
      <div className="text-xs text-warm-gray mb-4">{item.location_name} · {item.org_name}</div>
      {review.body && (<div className={`rounded-xl p-4 mb-4 ${isNegative ? 'bg-red-50 border border-red-200' : 'bg-warm-light/50 border border-warm-border/50'}`}><p className="text-sm text-ink leading-relaxed">{review.body}</p></div>)}
      {review.ai_draft && !editMode && (<div className="bg-amber-50 rounded-xl p-4 mb-4 border border-amber-200"><div className="text-[10px] text-amber-600 uppercase tracking-wider font-medium mb-2">AI Draft Reply</div><p className="text-sm text-ink leading-relaxed">{review.ai_draft}</p></div>)}
      {editMode && (
        <div className="mb-4">
          <div className="text-[10px] text-warm-gray uppercase tracking-wider font-medium mb-2">Edit Reply</div>
          <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={4} className="w-full px-4 py-3 border border-warm-border rounded-xl text-sm text-ink outline-none focus:ring-2 focus:ring-ink/20 resize-y placeholder:text-warm-gray" placeholder="Write your reply..." autoFocus />
          <div className="flex items-center gap-2 mt-2">
            <button onClick={onEditAndSend} disabled={actionLoading === 'edit' || !editText.trim()} className="px-4 py-2 bg-ink hover:bg-ink/90 text-cream text-xs font-medium rounded-full transition-colors disabled:opacity-50">{actionLoading === 'edit' ? 'Sending...' : 'Send Reply'}</button>
            <button onClick={() => setEditMode(false)} className="px-4 py-2 text-xs text-warm-gray hover:text-ink transition-colors">Cancel</button>
          </div>
        </div>
      )}
      {!editMode && (
        <div className="flex items-center gap-2 flex-wrap">
          {review.ai_draft && (<button onClick={onApprove} disabled={actionLoading === 'approve'} className="px-5 py-2.5 bg-ink hover:bg-ink/90 text-cream text-xs font-medium rounded-full transition-colors disabled:opacity-50">{actionLoading === 'approve' ? 'Sending...' : 'Send Reply'}</button>)}
          <button onClick={() => { setEditMode(true); setEditText(review.ai_draft || '') }} className="px-4 py-2.5 border border-warm-border text-xs text-ink rounded-full hover:border-ink transition-colors">{review.ai_draft ? 'Edit & Send' : 'Write Reply'}</button>
          <button onClick={onRegenerate} disabled={actionLoading === 'regenerate'} className="px-4 py-2.5 border border-warm-border text-xs text-warm-gray rounded-full hover:text-ink hover:border-ink transition-colors disabled:opacity-50">{actionLoading === 'regenerate' ? 'Generating...' : 'Regenerate'}</button>
          <div className="flex-1" />
          <button onClick={onSkip} disabled={actionLoading === 'skip'} className="px-4 py-2.5 text-xs text-warm-gray hover:text-ink transition-colors disabled:opacity-50">Skip</button>
          <button onClick={onReject} disabled={actionLoading === 'reject'} className="px-4 py-2.5 text-xs text-warm-gray hover:text-red-600 transition-colors disabled:opacity-50">Reject</button>
        </div>
      )}
    </div>
  )
}

// ─── Google Update Detail ────────────────────────────────────

function GoogleUpdateDetail({ item, actionLoading, onAction }: { item: WorkItem; actionLoading: string | null; onAction: (action: 'accept' | 'reject') => void }) {
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
          if (loadedDiffs.length === 0 && !autoResolvedRef.current) { autoResolvedRef.current = true; onAction('accept') }
        }
      } catch { if (!cancelled) setDiffs([]) }
      if (!cancelled) setLoadingDiffs(false)
    }
    load()
    return () => { cancelled = true }
  }, [item.location_id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loadingDiffs) return <div className="py-8 text-center text-xs text-warm-gray animate-pulse">Checking Google for changes...</div>
  if (!diffs || diffs.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0"><GoogleIcon className="w-5 h-5 text-blue-600" /></div>
        <div>
          <div className="flex items-center gap-2"><span className="text-sm font-medium text-ink">Google Suggested Edits</span><PriorityBadge priority="urgent" /></div>
          <div className="text-[10px] text-warm-gray mt-0.5">{item.google_update?.business_name || item.location_name}</div>
        </div>
      </div>
      <div className="text-xs text-warm-gray mb-4">{item.location_name} · {item.org_name}</div>
      <div className="space-y-3 mb-6">
        {diffs.map((d) => (
          <div key={d.field} className="text-xs">
            <div className="font-medium text-ink mb-1.5">{d.label}</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-warm-light/50 rounded-lg p-3 border border-warm-border/50"><div className="text-[10px] text-warm-gray uppercase tracking-wider mb-1">Current</div><div className="text-sm text-ink">{d.currentValue || '(empty)'}</div></div>
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200"><div className="text-[10px] text-blue-500 uppercase tracking-wider mb-1">Google suggests</div><div className="text-sm text-ink">{d.googleValue || '(empty)'}</div></div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => onAction('accept')} disabled={actionLoading === 'google_accept'} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-full transition-colors disabled:opacity-50">{actionLoading === 'google_accept' ? 'Accepting...' : 'Accept Changes'}</button>
        <button onClick={() => onAction('reject')} disabled={actionLoading === 'google_reject'} className="px-4 py-2.5 border border-warm-border text-xs text-warm-gray rounded-full hover:text-ink hover:border-ink transition-colors disabled:opacity-50">{actionLoading === 'google_reject' ? 'Rejecting...' : 'Reject & Keep Current'}</button>
      </div>
    </div>
  )
}

// ─── Post Detail ─────────────────────────────────────────────

function PostDetail({ item, editMode, editText, setEditMode, setEditText, actionLoading, onApprove, onEditPost, onReject, onDelete, onDismiss }: { item: WorkItem; editMode: boolean; editText: string; setEditMode: (v: boolean) => void; setEditText: (v: string) => void; actionLoading: string | null; onApprove: () => void; onEditPost: () => void; onReject: () => void; onDelete: () => void; onDismiss: () => void }) {
  const post = item.post!
  const isDraft = post.status === 'draft'
  const isAI = post.source === 'ai'
  const statusLabels: Record<string, { label: string; classes: string }> = { draft: { label: 'Draft', classes: 'text-amber-600 bg-amber-50' }, client_review: { label: 'Client Review', classes: 'text-blue-600 bg-blue-50' }, pending: { label: 'Approved', classes: 'text-emerald-600 bg-emerald-50' } }
  const statusStyle = statusLabels[post.status] || statusLabels.draft

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-warm-light flex items-center justify-center shrink-0"><PostIcon className="w-5 h-5 text-ink" /></div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink">{isDraft ? 'Post Draft' : 'Scheduled Post'}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusStyle.classes}`}>{statusStyle.label}</span>
            {isAI && <span className="text-[10px] px-2 py-0.5 rounded-full font-medium text-violet-600 bg-violet-50">AI Generated</span>}
          </div>
          <div className="text-[10px] text-warm-gray mt-0.5">{item.location_name}</div>
        </div>
      </div>
      <div className="text-xs text-warm-gray mb-4">{item.location_name} · {item.org_name}</div>
      {post.media_url && <div className="mb-4"><img src={post.media_url} alt="" className="w-full rounded-xl border border-warm-border/50 object-cover" style={{ aspectRatio: '4/3' }} /></div>}
      {!editMode && <div className="bg-warm-light/50 rounded-xl p-4 mb-4 border border-warm-border/50"><p className="text-sm text-ink leading-relaxed">{post.summary}</p></div>}
      {editMode && (
        <div className="mb-4">
          <div className="text-[10px] text-warm-gray uppercase tracking-wider font-medium mb-2">Edit Post</div>
          <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={4} maxLength={300} className="w-full px-4 py-3 border border-warm-border rounded-xl text-sm text-ink outline-none focus:ring-2 focus:ring-ink/20 resize-y placeholder:text-warm-gray" autoFocus />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-warm-gray">{editText.length}/300</span>
            <div className="flex items-center gap-2">
              <button onClick={onEditPost} disabled={actionLoading === 'edit_post' || !editText.trim()} className="px-4 py-2 bg-ink hover:bg-ink/90 text-cream text-xs font-medium rounded-full transition-colors disabled:opacity-50">{actionLoading === 'edit_post' ? 'Saving...' : 'Save'}</button>
              <button onClick={() => setEditMode(false)} className="px-4 py-2 text-xs text-warm-gray hover:text-ink transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
      {post.scheduled_for && <div className="text-xs text-warm-gray mb-4">Scheduled for {new Date(post.scheduled_for).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>}
      {!editMode && (
        <div className="flex items-center gap-2 flex-wrap">
          {isDraft && <button onClick={onApprove} disabled={actionLoading === 'approve_post'} className="px-5 py-2.5 bg-ink hover:bg-ink/90 text-cream text-xs font-medium rounded-full transition-colors disabled:opacity-50">{actionLoading === 'approve_post' ? 'Sending...' : 'Approve & Send to Client'}</button>}
          <button onClick={() => { setEditMode(true); setEditText(post.summary) }} className="px-4 py-2.5 border border-warm-border text-xs text-ink rounded-full hover:border-ink transition-colors">Edit</button>
          <div className="flex-1" />
          {isDraft && <button onClick={onReject} disabled={actionLoading === 'reject_post'} className="px-4 py-2.5 text-xs text-warm-gray hover:text-red-600 transition-colors disabled:opacity-50">{actionLoading === 'reject_post' ? 'Rejecting...' : 'Reject'}</button>}
          {!isDraft && <button onClick={onDismiss} className="px-4 py-2.5 text-xs text-warm-gray hover:text-ink transition-colors">Dismiss</button>}
        </div>
      )}
    </div>
  )
}

// ─── Sync Error Detail ───────────────────────────────────────

function SyncErrorDetail({ item, onDismiss }: { item: WorkItem; onDismiss: () => void }) {
  const error = item.sync_error!
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0"><AlertIcon className="w-5 h-5 text-red-600" /></div>
        <div>
          <div className="flex items-center gap-2"><span className="text-sm font-medium text-ink">Sync Error</span><PriorityBadge priority="important" /></div>
          <div className="text-[10px] text-warm-gray mt-0.5 capitalize">{error.source_type === 'review_source' ? 'Review source' : 'GBP profile'} · {error.platform}</div>
        </div>
      </div>
      <div className="text-xs text-warm-gray mb-4">{item.location_name} · {item.org_name}</div>
      {error.sync_error && <div className="bg-red-50 rounded-xl p-4 mb-4 border border-red-200"><div className="text-[10px] text-red-500 uppercase tracking-wider font-medium mb-1">Error</div><p className="text-sm text-ink leading-relaxed">{error.sync_error}</p></div>}
      {error.last_synced_at && <div className="text-xs text-warm-gray mb-4">Last synced {timeAgo(error.last_synced_at)} ago</div>}
      <div className="flex items-center gap-2">
        <a href={`/admin/${item.org_slug}/locations/${item.location_id}`} className="px-4 py-2.5 border border-warm-border text-xs text-ink rounded-full hover:border-ink transition-colors no-underline">View Location</a>
        <button onClick={onDismiss} className="px-4 py-2.5 text-xs text-warm-gray hover:text-ink transition-colors">Dismiss</button>
      </div>
    </div>
  )
}

// ─── Profile Optimization Detail ─────────────────────────────

function ProfileOptDetail({ item, actionLoading, onApproveRec, onApproveBatch, onRejectRec, onEditRec }: { item: WorkItem; actionLoading: string | null; onApproveRec: (recId: string, editedValue?: unknown) => void; onApproveBatch: () => void; onRejectRec: (recId: string) => void; onEditRec: (recId: string, editedValue: unknown) => void }) {
  const opt = item.profile_optimization!
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const pendingRecs = opt.recommendations.filter((r) => r.status === 'pending')
  const clientReviewRecs = opt.recommendations.filter((r) => r.status === 'client_review')
  const fieldLabels: Record<string, string> = { description: 'Business Description', categories: 'Additional Categories', attributes: 'Business Attributes', hours: 'Business Hours' }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center"><OptimizeIcon className="w-5 h-5 text-violet-600" /></div>
        <div>
          <div className="text-base font-medium text-ink">Profile Optimization</div>
          <div className="text-xs text-warm-gray">{item.location_name} · {item.org_name}</div>
        </div>
      </div>
      {pendingRecs.length > 0 && (
        <>
          <div className="text-[11px] text-warm-gray uppercase tracking-wider font-medium mb-3">Pending Review ({pendingRecs.length})</div>
          {pendingRecs.map((rec) => (
            <div key={rec.id} className="bg-warm-light rounded-xl p-4 mb-3 border border-warm-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-ink">{fieldLabels[rec.field] || rec.field}</span>
                {rec.requires_client_approval && <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Needs client approval</span>}
              </div>
              {rec.ai_rationale && <p className="text-xs text-warm-gray mb-3">{rec.ai_rationale}</p>}
              {rec.field === 'description' && (
                <div className="mb-3">
                  {rec.current_value != null && (<div className="mb-2"><div className="text-[10px] text-warm-gray uppercase tracking-wider mb-1">Current</div><p className="text-xs text-ink/60 leading-relaxed">{String(rec.current_value)}</p></div>)}
                  <div>
                    <div className="text-[10px] text-emerald-600 uppercase tracking-wider mb-1">Proposed</div>
                    {editingId === rec.id ? (
                      <div>
                        <textarea value={editValue} onChange={(e) => setEditValue(e.target.value)} className="w-full text-xs text-ink leading-relaxed p-3 border border-warm-border rounded-lg bg-white resize-none focus:outline-none focus:border-ink" rows={6} />
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[10px] text-warm-gray font-mono">{editValue.length} chars</span>
                          <div className="flex-1" />
                          <button onClick={() => setEditingId(null)} className="text-xs text-warm-gray hover:text-ink transition-colors">Cancel</button>
                          <button onClick={() => { onEditRec(rec.id, editValue); setEditingId(null) }} className="px-3 py-1.5 text-xs bg-ink text-cream rounded-full hover:bg-ink/80 transition-colors">Save Edit</button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-ink leading-relaxed">{String(rec.edited_value || rec.proposed_value)}</p>
                    )}
                  </div>
                </div>
              )}
              {rec.field === 'categories' && (
                <div className="mb-3">
                  <div className="text-[10px] text-emerald-600 uppercase tracking-wider mb-1">Suggested Categories</div>
                  <div className="flex flex-wrap gap-1.5">{(rec.proposed_value as string[] || []).map((cat, i) => (<span key={i} className="text-xs bg-white border border-warm-border rounded-full px-2.5 py-1 text-ink">{cat}</span>))}</div>
                </div>
              )}
              {rec.field === 'hours' && <div className="mb-3"><p className="text-xs text-ink">Business hours need to be set manually.</p></div>}
              <div className="flex items-center gap-2 pt-2 border-t border-warm-border/50">
                {rec.field !== 'hours' && <button onClick={() => onApproveRec(rec.id, rec.edited_value || undefined)} disabled={actionLoading === `approve_rec_${rec.id}`} className="px-3 py-1.5 text-xs bg-ink text-cream rounded-full hover:bg-ink/80 transition-colors disabled:opacity-50">{actionLoading === `approve_rec_${rec.id}` ? 'Approving...' : (rec.requires_client_approval ? 'Approve & Send to Client' : 'Approve & Apply')}</button>}
                {rec.field === 'description' && editingId !== rec.id && <button onClick={() => { setEditingId(rec.id); setEditValue(String(rec.edited_value || rec.proposed_value || '')) }} className="px-3 py-1.5 text-xs border border-warm-border text-ink rounded-full hover:border-ink transition-colors">Edit</button>}
                <button onClick={() => onRejectRec(rec.id)} disabled={actionLoading === `reject_rec_${rec.id}`} className="px-3 py-1.5 text-xs text-warm-gray hover:text-red-600 transition-colors disabled:opacity-50">Reject</button>
              </div>
            </div>
          ))}
          {pendingRecs.length > 1 && <button onClick={onApproveBatch} disabled={actionLoading === 'approve_batch'} className="w-full py-2.5 text-xs bg-ink text-cream rounded-full hover:bg-ink/80 transition-colors disabled:opacity-50 mb-4">{actionLoading === 'approve_batch' ? 'Approving all...' : `Approve All ${pendingRecs.length} Recommendations`}</button>}
        </>
      )}
      {clientReviewRecs.length > 0 && (
        <>
          <div className="text-[11px] text-emerald-600 uppercase tracking-wider font-medium mb-3 mt-4">Awaiting Client Approval ({clientReviewRecs.length})</div>
          {clientReviewRecs.map((rec) => (<div key={rec.id} className="bg-emerald-50 rounded-xl p-4 mb-3 border border-emerald-200"><div className="flex items-center justify-between mb-2"><span className="text-xs font-medium text-ink">{fieldLabels[rec.field] || rec.field}</span><span className="text-[10px] text-emerald-600 font-medium">Sent to client</span></div><p className="text-xs text-ink/60 leading-relaxed">{String(rec.edited_value || rec.proposed_value)}</p></div>))}
        </>
      )}
      <a href={`/admin/${item.org_slug}/locations/${item.location_id}/gbp-profile`} className="inline-block mt-2 px-4 py-2.5 border border-warm-border text-xs text-ink rounded-full hover:border-ink transition-colors no-underline">View Full Profile</a>
    </div>
  )
}

// ─── Stale Lander Detail ─────────────────────────────────────

function StaleLanderDetail({ item, actionLoading, onRegenerate, onDismiss }: { item: WorkItem; actionLoading: string | null; onRegenerate: () => void; onDismiss: () => void }) {
  const lander = item.stale_lander!
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0"><LanderIcon className="w-5 h-5 text-amber-600" /></div>
        <div>
          <div className="flex items-center gap-2"><span className="text-sm font-medium text-ink">Stale Lander Content</span><PriorityBadge priority="important" /></div>
          <div className="text-[10px] text-warm-gray mt-0.5">{item.location_name}</div>
        </div>
      </div>
      <div className="text-xs text-warm-gray mb-4">{item.location_name} · {item.org_name}</div>
      <div className="bg-amber-50 rounded-xl p-4 mb-4 border border-amber-200">
        <div className="text-[10px] text-amber-600 uppercase tracking-wider font-medium mb-2">Content Outdated</div>
        <p className="text-sm text-ink leading-relaxed">The GBP profile has been updated since the lander content was last generated. Regenerate to keep the landing page accurate.</p>
      </div>
      <div className="text-xs text-warm-gray mb-4">Landing page: <a href={`/l/${lander.slug}`} target="_blank" rel="noopener noreferrer" className="text-ink underline">/l/{lander.slug}</a></div>
      <div className="flex items-center gap-2">
        <button onClick={onRegenerate} disabled={actionLoading === 'regenerate_lander'} className="px-5 py-2.5 bg-ink hover:bg-ink/90 text-cream text-xs font-medium rounded-full transition-colors disabled:opacity-50">{actionLoading === 'regenerate_lander' ? 'Regenerating...' : 'Regenerate Content'}</button>
        <a href={`/admin/${item.org_slug}/locations/${item.location_id}/lander`} className="px-4 py-2.5 border border-warm-border text-xs text-ink rounded-full hover:border-ink transition-colors no-underline">View Lander</a>
        <div className="flex-1" />
        <button onClick={onDismiss} disabled={actionLoading === 'dismiss_lander'} className="px-4 py-2.5 text-xs text-warm-gray hover:text-ink transition-colors disabled:opacity-50">Dismiss</button>
      </div>
    </div>
  )
}

// ─── Shared Components ───────────────────────────────────────

function AssignDropdown({ item, teamMembers, onAssign }: { item: WorkItem; teamMembers: TeamMember[]; onAssign: (userId: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const assigned = teamMembers.find((m) => m.id === item.assigned_to)
  return (
    <div className="relative mb-4">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-[11px] text-warm-gray hover:text-ink transition-colors">
        <UserIcon className="w-3.5 h-3.5" />{assigned ? assigned.email.split('@')[0] : 'Assign'}<ChevronIcon className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 bg-white border border-warm-border rounded-lg shadow-lg py-1 min-w-[180px]">
          {item.assigned_to && <button onClick={() => { onAssign(null); setOpen(false) }} className="w-full text-left px-3 py-1.5 text-xs text-warm-gray hover:bg-warm-light transition-colors">Unassign</button>}
          {teamMembers.map((m) => (<button key={m.id} onClick={() => { onAssign(m.id); setOpen(false) }} className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${m.id === item.assigned_to ? 'text-ink font-medium bg-warm-light' : 'text-ink hover:bg-warm-light'}`}>{m.email.split('@')[0]}<span className="text-warm-gray ml-1">({m.email})</span></button>))}
        </div>
      )}
    </div>
  )
}

function PriorityDot({ priority }: { priority: string }) {
  const colors: Record<string, string> = { urgent: 'bg-red-500', important: 'bg-amber-500', info: 'bg-warm-border' }
  return <div className={`w-2 h-2 rounded-full shrink-0 ${colors[priority] || 'bg-warm-border'}`} />
}

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === 'urgent') return <span className="text-[10px] text-red-600 font-medium bg-red-50 px-1.5 py-0.5 rounded">Urgent</span>
  return null
}

function TypeIcon({ type }: { type: GroupedType }) {
  const icons: Record<GroupedType, { bg: string; icon: JSX.Element }> = {
    reviews: { bg: 'bg-amber-100', icon: <StarIcon className="w-3.5 h-3.5 text-amber-600" /> },
    google_updates: { bg: 'bg-blue-100', icon: <GoogleIcon className="w-3.5 h-3.5 text-blue-600" /> },
    posts: { bg: 'bg-warm-light', icon: <PostIcon className="w-3.5 h-3.5 text-ink" /> },
    optimizations: { bg: 'bg-violet-100', icon: <OptimizeIcon className="w-3.5 h-3.5 text-violet-600" /> },
    sync_errors: { bg: 'bg-red-100', icon: <AlertIcon className="w-3.5 h-3.5 text-red-600" /> },
    stale_landers: { bg: 'bg-amber-100', icon: <LanderIcon className="w-3.5 h-3.5 text-amber-600" /> },
  }
  const config = icons[type]
  if (!config) return null
  return <div className={`w-6 h-6 rounded-full ${config.bg} flex items-center justify-center shrink-0`}>{config.icon}</div>
}

// ─── Helpers ─────────────────────────────────────────────────

function isReviewItem(item: WorkItem): boolean {
  return item.type === 'review_reply' || item.type === 'ai_draft_review'
}

function renderStarsCompact(rating: number): string {
  return '\u2605'.repeat(rating) + '\u2606'.repeat(5 - rating)
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

function filterMatchesGroupedType(filter: FilterType, groupedType: GroupedType): boolean {
  switch (filter) {
    case 'needs_reply':
    case 'ai_drafts':
      return groupedType === 'reviews'
    case 'google_updates':
      return groupedType === 'google_updates'
    case 'posts':
      return groupedType === 'posts'
    case 'sync_errors':
      return groupedType === 'sync_errors'
    case 'profile_optimizations':
      return groupedType === 'optimizations'
    case 'stale_landers':
      return groupedType === 'stale_landers'
    default:
      return true
  }
}

function findGroup(groups: OrgGroup[], key: string): { group: OrgGroup; typeGroup: TypeGroup } | null {
  for (const group of groups) {
    for (const typeGroup of group.types) {
      if (`${group.org_name}__${typeGroup.key}` === key) {
        return { group, typeGroup }
      }
    }
  }
  return null
}

// ─── Icons ───────────────────────────────────────────────────

function CheckIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
}

function BackIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
}

function ArrowIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
}

function GoogleIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
}

function PostIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
}

function AlertIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
}

function StarIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
}

function UserIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
}

function ChevronIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
}

function OptimizeIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" /></svg>
}

function LanderIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><path d="M2 10h20" /></svg>
}
