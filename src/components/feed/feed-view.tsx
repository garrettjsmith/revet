'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { FeedHeader } from './feed-header'
import { FeedFilters } from './feed-filters'
import { FeedNewItemsBanner } from './feed-new-items-banner'
import { FeedCard } from './feed-card'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WorkItem = any

type FilterType = 'all' | 'reviews' | 'posts' | 'profiles' | 'errors' | 'landers'
type ScopeType = 'all' | 'mine'

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

interface FeedData {
  groups: FeedGroup[]
  counts: {
    total: number
    reviews: number
    posts: number
    profiles: number
    errors: number
    landers: number
  }
  total_groups: number
  offset: number
  has_more: boolean
  scope: 'all' | 'mine'
  is_agency_admin: boolean
  latest_created_at: string
}

interface OrgOption {
  id: string
  name: string
  slug: string
}

interface LocationOption {
  id: string
  name: string
  city: string | null
  state: string | null
}

export function FeedView() {
  const [data, setData] = useState<FeedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [filter, setFilter] = useState<FilterType>('all')
  const [scope, setScope] = useState<ScopeType>('all')
  const [orgFilter, setOrgFilter] = useState<OrgOption | null>(null)
  const [locationFilter, setLocationFilter] = useState<LocationOption | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // ─── Data fetching ──────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ filter, scope })
      if (orgFilter) params.set('org_id', orgFilter.id)
      if (locationFilter) params.set('location_id', locationFilter.id)

      const res = await fetch(`/api/agency/feed?${params}`)
      if (res.ok) {
        const newData: FeedData = await res.json()
        setData(newData)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [filter, scope, orgFilter, locationFilter])

  const fetchMore = useCallback(async () => {
    if (!data?.has_more || loadingMore) return
    setLoadingMore(true)
    try {
      const params = new URLSearchParams({
        filter,
        scope,
        offset: String(data.groups.length),
      })
      if (orgFilter) params.set('org_id', orgFilter.id)
      if (locationFilter) params.set('location_id', locationFilter.id)

      const res = await fetch(`/api/agency/feed?${params}`)
      if (res.ok) {
        const page: FeedData = await res.json()
        setData((prev) => prev ? {
          ...prev,
          groups: [...prev.groups, ...page.groups],
          has_more: page.has_more,
        } : prev)
      }
    } catch {
      // ignore
    } finally {
      setLoadingMore(false)
    }
  }, [data?.has_more, data?.groups.length, loadingMore, filter, scope, orgFilter, locationFilter])

  // Fetch on mount and when filters change
  useEffect(() => {
    setLoading(true)
    fetchData()
  }, [fetchData])

  // Poll and focus refresh
  useEffect(() => {
    const interval = setInterval(fetchData, 60_000)
    const handleFocus = () => fetchData()
    window.addEventListener('focus', handleFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
    }
  }, [fetchData])

  // Infinite scroll
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

  // ─── Actions ─────────────────────────────────────────────

  const removeItemFromGroup = (groupKey: string, itemId: string) => {
    setData((prev) => {
      if (!prev) return prev
      const newGroups = prev.groups
        .map((g) => {
          if (g.group_key !== groupKey) return g
          const newItems = g.items.filter((i: WorkItem) => i.id !== itemId)
          return { ...g, items: newItems, item_count: newItems.length }
        })
        .filter((g) => g.item_count > 0)

      return { ...prev, groups: newGroups }
    })
  }

  const removeGroup = (groupKey: string) => {
    setData((prev) => {
      if (!prev) return prev
      return { ...prev, groups: prev.groups.filter((g) => g.group_key !== groupKey) }
    })
  }

  const handleApproveItem = async (item: WorkItem) => {
    setActionLoading(item.id)
    try {
      let ok = false
      switch (item.type) {
        case 'ai_draft_review': {
          if (!item.review?.ai_draft) break
          const res = await fetch(`/api/reviews/${item.review.id}/reply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reply_body: item.review.ai_draft }),
          })
          ok = res.ok
          break
        }
        case 'post_pending': {
          if (!item.post || item.post.status !== 'draft') break
          const res = await fetch(`/api/posts/${item.post.id}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'agency_approve' }),
          })
          ok = res.ok
          break
        }
        case 'profile_optimization': {
          if (!item.profile_optimization) break
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
          ok = res.ok
          break
        }
        case 'google_update': {
          const res = await fetch(`/api/locations/${item.location_id}/gbp-profile/google-updates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'accept' }),
          })
          ok = res.ok
          break
        }
        case 'stale_lander': {
          const res = await fetch('/api/landers/ai-content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ location_id: item.location_id }),
          })
          ok = res.ok
          break
        }
      }
      if (ok) {
        // Find which group this item belongs to and remove it
        const group = data?.groups.find((g) => g.items.some((i: WorkItem) => i.id === item.id))
        if (group) removeItemFromGroup(group.group_key, item.id)
      }
    } catch {
      // ignore — could add toast here
    }
    setActionLoading(null)
  }

  const handleRejectItem = async (item: WorkItem) => {
    setActionLoading(item.id)
    try {
      let ok = false
      switch (item.type) {
        case 'ai_draft_review': {
          const res = await fetch(`/api/reviews/${item.review.id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'seen', clear_draft: true }),
          })
          ok = res.ok
          break
        }
        case 'review_reply': {
          const res = await fetch(`/api/reviews/${item.review.id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'seen' }),
          })
          ok = res.ok
          break
        }
        case 'post_pending': {
          if (!item.post) break
          const res = await fetch(`/api/posts/${item.post.id}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'reject' }),
          })
          ok = res.ok
          break
        }
        case 'profile_optimization': {
          if (!item.profile_optimization) break
          // Reject all recs in the batch
          for (const rec of item.profile_optimization.recommendations) {
            await fetch(`/api/locations/${item.location_id}/recommendations`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'reject', recommendation_id: rec.id }),
            })
          }
          ok = true
          break
        }
        case 'google_update': {
          const res = await fetch(`/api/locations/${item.location_id}/gbp-profile/google-updates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'reject' }),
          })
          ok = res.ok
          break
        }
      }
      if (ok) {
        const group = data?.groups.find((g) => g.items.some((i: WorkItem) => i.id === item.id))
        if (group) removeItemFromGroup(group.group_key, item.id)
      }
    } catch {
      // ignore
    }
    setActionLoading(null)
  }

  const handleEditItem = async (item: WorkItem, text: string) => {
    setActionLoading(item.id)
    try {
      let ok = false
      switch (item.type) {
        case 'ai_draft_review':
        case 'review_reply': {
          const res = await fetch(`/api/reviews/${item.review.id}/reply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reply_body: text }),
          })
          ok = res.ok
          break
        }
        case 'post_pending': {
          if (!item.post) break
          const res = await fetch(`/api/posts/${item.post.id}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'edit', summary: text }),
          })
          ok = res.ok
          // Edit doesn't remove the item — update its text
          if (ok) {
            setData((prev) => {
              if (!prev) return prev
              return {
                ...prev,
                groups: prev.groups.map((g) => ({
                  ...g,
                  items: g.items.map((i: WorkItem) =>
                    i.id === item.id ? { ...i, post: { ...i.post, summary: text } } : i
                  ),
                })),
              }
            })
          }
          setActionLoading(null)
          return // don't remove
        }
      }
      if (ok) {
        const group = data?.groups.find((g) => g.items.some((i: WorkItem) => i.id === item.id))
        if (group) removeItemFromGroup(group.group_key, item.id)
      }
    } catch {
      // ignore
    }
    setActionLoading(null)
  }

  const handleRegenerateItem = async (item: WorkItem) => {
    if (item.type !== 'ai_draft_review' && item.type !== 'review_reply') return
    setActionLoading(item.id)
    try {
      const res = await fetch(`/api/reviews/${item.review.id}/ai-reply`, { method: 'POST' })
      const result = await res.json()
      if (res.ok && result.draft) {
        setData((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            groups: prev.groups.map((g) => ({
              ...g,
              items: g.items.map((i: WorkItem) =>
                i.id === item.id
                  ? { ...i, type: 'ai_draft_review', review: { ...i.review, ai_draft: result.draft, ai_draft_generated_at: new Date().toISOString() } }
                  : i
              ),
            })),
          }
        })
      }
    } catch {
      // ignore
    }
    setActionLoading(null)
  }

  const handleDismissItem = async (item: WorkItem) => {
    setActionLoading(item.id)
    try {
      let ok = false
      if (item.type === 'sync_error') {
        // Sync errors are just removed from view
        ok = true
      } else if (item.type === 'stale_lander' && item.stale_lander) {
        const res = await fetch(`/api/landers/${item.stale_lander.lander_id}/dismiss-stale`, {
          method: 'POST',
        })
        ok = res.ok
      }
      if (ok) {
        const group = data?.groups.find((g) => g.items.some((i: WorkItem) => i.id === item.id))
        if (group) removeItemFromGroup(group.group_key, item.id)
      }
    } catch {
      // ignore
    }
    setActionLoading(null)
  }

  const handleApproveAll = async (group: FeedGroup) => {
    // Approve each approvable item in the group
    const approvable = group.items.filter((item: WorkItem) => {
      if (item.type === 'post_pending') return item.post?.status === 'draft'
      if (item.type === 'review_reply') return false // needs text
      return true
    })

    for (const item of approvable) {
      await handleApproveItem(item)
    }

    // If all items were approved, remove the group
    if (approvable.length === group.items.length) {
      removeGroup(group.group_key)
    }
  }

  // ─── Loading state ──────────────────────────────────────

  if (loading) {
    return (
      <div className="h-screen flex flex-col">
        <FeedHeader
          counts={null}
          filter={filter}
          setFilter={setFilter}
          scope={scope}
          setScope={setScope}
          isAgencyAdmin={false}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-sm text-warm-gray">Loading feed...</div>
        </div>
      </div>
    )
  }

  // ─── Empty state ────────────────────────────────────────

  const groups = data?.groups || []

  if (groups.length === 0) {
    return (
      <div className="h-screen flex flex-col">
        <FeedHeader
          counts={data?.counts || null}
          filter={filter}
          setFilter={setFilter}
          scope={scope}
          setScope={setScope}
          isAgencyAdmin={!!data?.is_agency_admin}
        />
        <FeedFilters
          org={orgFilter}
          location={locationFilter}
          onOrgChange={setOrgFilter}
          onLocationChange={setLocationFilter}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="text-sm font-medium text-ink">All caught up</div>
            <div className="text-xs text-warm-gray mt-1">No items need attention</div>
          </div>
        </div>
      </div>
    )
  }

  // ─── Feed ───────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col">
      <FeedHeader
        counts={data?.counts || null}
        filter={filter}
        setFilter={setFilter}
        scope={scope}
        setScope={setScope}
        isAgencyAdmin={!!data?.is_agency_admin}
      />
      <FeedFilters
        org={orgFilter}
        location={locationFilter}
        onOrgChange={setOrgFilter}
        onLocationChange={setLocationFilter}
      />

      <div className="flex-1 overflow-y-auto">
        <FeedNewItemsBanner
          latestCreatedAt={data?.latest_created_at || null}
          scope={scope}
          orgId={orgFilter?.id || null}
          onRefresh={fetchData}
        />

        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 space-y-3">
          {groups.map((group) => (
            <FeedCard
              key={group.group_key}
              group={group}
              actionLoading={actionLoading}
              onApproveItem={handleApproveItem}
              onRejectItem={handleRejectItem}
              onEditItem={handleEditItem}
              onRegenerateItem={handleRegenerateItem}
              onDismissItem={handleDismissItem}
              onApproveAll={handleApproveAll}
            />
          ))}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />
          {loadingMore && (
            <div className="py-4 text-center text-xs text-warm-gray animate-pulse">Loading more...</div>
          )}
        </div>
      </div>
    </div>
  )
}
