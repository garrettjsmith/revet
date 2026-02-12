'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface SubItem {
  name: string
  path: string
}

interface ActionItem {
  type: string
  priority: 'urgent' | 'important' | 'info'
  count: number
  label: string
  action_label: string
  action_path: string
  locations?: SubItem[]
}

interface ActionItemsData {
  items: ActionItem[]
  summary: {
    total_locations: number
    total_reviews: number
    unread_total: number
  }
}

interface ActionItemsProps {
  apiPath: string
}

export function ActionItems({ apiPath }: ActionItemsProps) {
  const [data, setData] = useState<ActionItemsData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(apiPath)
      if (res.ok) {
        setData(await res.json())
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [apiPath])

  useEffect(() => {
    fetchData()

    // Refresh every 60 seconds
    const interval = setInterval(fetchData, 60_000)

    // Refresh on window focus
    const handleFocus = () => fetchData()
    window.addEventListener('focus', handleFocus)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
    }
  }, [fetchData])

  if (loading) {
    return (
      <div className="border border-warm-border rounded-xl p-5 mb-8">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-32 bg-warm-light rounded" />
          <div className="h-10 bg-warm-light rounded" />
          <div className="h-10 bg-warm-light rounded" />
        </div>
      </div>
    )
  }

  if (!data) return null

  // No action items: show all-clear state
  if (data.items.length === 0) {
    return (
      <div className="border border-warm-border rounded-xl p-5 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
            <CheckIcon className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <div className="text-sm font-medium text-ink">All clear</div>
            <div className="text-xs text-warm-gray">
              {data.summary.total_locations} location{data.summary.total_locations === 1 ? '' : 's'} active
              {data.summary.unread_total > 0 ? ` · ${data.summary.unread_total} unread review${data.summary.unread_total === 1 ? '' : 's'}` : ''}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const priorityOrder = { urgent: 0, important: 1, info: 2 }
  const sorted = [...data.items].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

  return (
    <div className="border border-warm-border rounded-xl overflow-hidden mb-8">
      <div className="px-5 py-3.5 border-b border-warm-border">
        <h2 className="text-sm font-semibold text-ink">Needs Attention</h2>
      </div>
      <div className="divide-y divide-warm-border/50">
        {sorted.map((item) => (
          <div key={item.type} className="px-5 py-3.5 hover:bg-warm-light/30 transition-colors">
            <div className="flex items-center gap-3">
              <PriorityDot priority={item.priority} />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-ink">{item.label}</div>
              </div>
              <Link
                href={item.action_path}
                className="text-xs text-warm-gray hover:text-ink no-underline whitespace-nowrap transition-colors"
              >
                {item.action_label} →
              </Link>
            </div>
            {/* Location sub-items for actionable drill-down */}
            {item.locations && item.locations.length > 0 && (
              <div className="ml-5 mt-2 flex flex-wrap gap-1.5">
                {item.locations.map((loc) => (
                  <Link
                    key={loc.path}
                    href={loc.path}
                    className="inline-flex items-center px-2.5 py-1 text-[11px] text-warm-gray bg-warm-light/50 border border-warm-border/50 rounded-full hover:text-ink hover:border-warm-border no-underline transition-colors"
                  >
                    {loc.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function PriorityDot({ priority }: { priority: 'urgent' | 'important' | 'info' }) {
  const colors = {
    urgent: 'bg-red-500',
    important: 'bg-amber-500',
    info: 'bg-warm-border',
  }

  return (
    <div className={`w-2 h-2 rounded-full shrink-0 ${colors[priority]}`} />
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
