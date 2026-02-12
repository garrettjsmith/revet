'use client'

import { useState, useEffect } from 'react'

interface MetricSummary {
  value: number
  previous: number
  trend: number
}

interface DailyPoint {
  date: string
  impressions: number
  website_clicks: number
  call_clicks: number
  direction_requests: number
}

interface PerformanceData {
  period: string
  days: number
  metrics: {
    total_impressions: MetricSummary
    website_clicks: MetricSummary
    call_clicks: MetricSummary
    direction_requests: MetricSummary
  }
  daily: DailyPoint[]
}

const PERIODS = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
]

export function PerformanceChart({ locationId }: { locationId: string }) {
  const [period, setPeriod] = useState('30d')
  const [data, setData] = useState<PerformanceData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/locations/${locationId}/performance?period=${period}`)
      .then((res) => res.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [locationId, period])

  if (loading) {
    return (
      <div className="border border-warm-border rounded-xl p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-32 bg-warm-border rounded" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-warm-border/50 rounded-lg" />
            ))}
          </div>
          <div className="h-32 bg-warm-border/30 rounded-lg" />
        </div>
      </div>
    )
  }

  if (!data || !data.daily || data.daily.length === 0) {
    return (
      <div className="border border-warm-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-ink">Performance</h2>
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
        <p className="text-sm text-warm-gray text-center py-8">
          No performance data available yet. Data syncs daily.
        </p>
      </div>
    )
  }

  const { metrics, daily } = data

  const cards: { label: string; metric: MetricSummary }[] = [
    { label: 'Impressions', metric: metrics.total_impressions },
    { label: 'Website Clicks', metric: metrics.website_clicks },
    { label: 'Calls', metric: metrics.call_clicks },
    { label: 'Directions', metric: metrics.direction_requests },
  ]

  return (
    <div className="border border-warm-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-warm-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Performance</h2>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>
      <div className="p-5 space-y-5">
        {/* Metric cards */}
        <div className="grid grid-cols-4 gap-3">
          {cards.map((c) => (
            <MetricCard key={c.label} label={c.label} metric={c.metric} />
          ))}
        </div>

        {/* Chart */}
        <ImpressionsChart daily={daily} />
      </div>
    </div>
  )
}

function PeriodSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={`px-2.5 py-1 text-[10px] font-medium rounded-full transition-colors ${
            value === p.value
              ? 'bg-ink text-cream'
              : 'text-warm-gray hover:text-ink'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

function MetricCard({ label, metric }: { label: string; metric: MetricSummary }) {
  const trend = metric.trend
  const trendColor = trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-red-500' : 'text-warm-gray'
  const trendArrow = trend > 0 ? '+' : ''

  return (
    <div className="bg-warm-light rounded-lg p-3">
      <div className="text-[10px] text-warm-gray uppercase tracking-wider mb-1">{label}</div>
      <div className="text-lg font-bold font-mono text-ink">
        {metric.value.toLocaleString()}
      </div>
      {metric.previous > 0 && (
        <div className={`text-[10px] font-medium ${trendColor} mt-0.5`}>
          {trendArrow}{trend.toFixed(0)}% vs prev
        </div>
      )}
    </div>
  )
}

function ImpressionsChart({ daily }: { daily: DailyPoint[] }) {
  if (daily.length === 0) return null

  const values = daily.map((d) => d.impressions)
  const max = Math.max(...values, 1)

  const width = 100
  const height = 40
  const padding = 1

  const points = daily.map((d, i) => {
    const x = (i / Math.max(daily.length - 1, 1)) * (width - padding * 2) + padding
    const y = height - (d.impressions / max) * (height - 4) - 2
    return `${x},${y}`
  })

  const areaPoints = [
    `${padding},${height}`,
    ...points,
    `${width - padding},${height}`,
  ].join(' ')

  return (
    <div>
      <div className="text-[10px] text-warm-gray uppercase tracking-wider mb-2">
        Daily Impressions
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-24"
        preserveAspectRatio="none"
      >
        <polygon
          points={areaPoints}
          fill="rgba(26,26,26,0.06)"
        />
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="#1a1a1a"
          strokeWidth="0.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[9px] text-warm-gray">
          {new Date(daily[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
        <span className="text-[9px] text-warm-gray">
          {new Date(daily[daily.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>
    </div>
  )
}
