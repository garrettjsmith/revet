'use client'

import { useState, useEffect, useRef } from 'react'

interface FeedNewItemsBannerProps {
  latestCreatedAt: string | null
  scope: string
  orgId: string | null
  onRefresh: () => void
}

export function FeedNewItemsBanner({ latestCreatedAt, scope, orgId, onRefresh }: FeedNewItemsBannerProps) {
  const [newCount, setNewCount] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    if (!latestCreatedAt) return

    const check = async () => {
      try {
        const params = new URLSearchParams({ since: latestCreatedAt, scope })
        if (orgId) params.set('org_id', orgId)
        const res = await fetch(`/api/agency/feed/check?${params}`)
        if (res.ok) {
          const data = await res.json()
          setNewCount(data.new_count || 0)
        }
      } catch {
        // ignore
      }
    }

    intervalRef.current = setInterval(check, 60_000)
    return () => clearInterval(intervalRef.current)
  }, [latestCreatedAt, scope, orgId])

  if (newCount === 0) return null

  return (
    <button
      type="button"
      onClick={() => {
        setNewCount(0)
        onRefresh()
      }}
      className="w-full px-5 py-2.5 bg-warm-light text-ink text-xs font-medium text-center hover:bg-warm-border/50 transition-colors border-b border-warm-border"
    >
      {newCount} new item{newCount !== 1 ? 's' : ''} — click to refresh
    </button>
  )
}
