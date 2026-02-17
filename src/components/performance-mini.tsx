'use client'

import { useState, useEffect } from 'react'

interface MetricSummary {
  value: number
  previous: number
  trend: number
}

interface PerformanceData {
  metrics: {
    total_impressions: MetricSummary
    website_clicks: MetricSummary
    call_clicks: MetricSummary
    direction_requests: MetricSummary
  }
}

/**
 * Compact performance summary for the location overview page.
 * Shows 4 metrics in a single row with trend arrows.
 */
export function PerformanceMini({ locationId }: { locationId: string }) {
  const [data, setData] = useState<PerformanceData | null>(null)

  useEffect(() => {
    fetch(`/api/locations/${locationId}/performance?period=7d`)
      .then((res) => res.json())
      .then((d) => { if (d.metrics) setData(d) })
      .catch(() => {})
  }, [locationId])

  if (!data) return null

  const items = [
    { label: 'Impressions', ...data.metrics.total_impressions },
    { label: 'Clicks', ...data.metrics.website_clicks },
    { label: 'Calls', ...data.metrics.call_clicks },
    { label: 'Directions', ...data.metrics.direction_requests },
  ]

  // Only show if there's any data
  if (items.every((i) => i.value === 0)) return null

  return (
    <div className="px-5 py-3 border-t border-warm-border/50">
      <div className="flex items-center gap-6">
        <span className="text-[10px] text-warm-gray uppercase tracking-wider font-medium shrink-0">
          7d
        </span>
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <span className="text-[10px] text-warm-gray">{item.label}</span>
            <span className="text-xs font-mono font-medium text-ink">{item.value.toLocaleString()}</span>
            {item.previous > 0 && (
              <span className={`text-[9px] font-medium ${
                item.trend > 0 ? 'text-emerald-600' : item.trend < 0 ? 'text-red-500' : 'text-warm-gray'
              }`}>
                {item.trend > 0 ? '+' : ''}{item.trend.toFixed(0)}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
