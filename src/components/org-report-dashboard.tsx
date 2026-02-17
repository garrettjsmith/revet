'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────

interface LocationReport {
  id: string
  name: string
  city: string | null
  state: string | null
  type: string
  avg_rating: number | null
  total_reviews: number
  reviews_30d: number
  replied_count: number
  response_rate: number
  days_since_last_review: number | null
  gbp_actions_30d: number
  gbp_actions_trend: number
  gbp_impressions_30d: number
  solv: number | null
  health: 'healthy' | 'attention' | 'at_risk'
}

interface Summary {
  total_locations: number
  avg_rating: number | null
  total_reviews: number
  reviews_30d: number
  response_rate: number
  total_gbp_actions: number
  gbp_actions_trend: number
  total_impressions: number
  avg_solv: number | null
  locations_with_solv: number
  locations_healthy: number
  locations_attention: number
  locations_at_risk: number
}

interface DailyData {
  date: string
  impressions: number
  actions: number
  calls: number
  directions: number
  clicks: number
}

interface Props {
  orgSlug: string
  summary: Summary
  sentimentCounts: { positive: number; neutral: number; negative: number }
  locations: LocationReport[]
  daily: DailyData[]
}

type SortField = 'name' | 'avg_rating' | 'reviews_30d' | 'response_rate' | 'gbp_actions_30d' | 'solv' | 'health'
type SortDir = 'asc' | 'desc'
type ChartMetric = 'impressions' | 'actions' | 'calls' | 'directions' | 'clicks'

// ─── Component ────────────────────────────────────────────

type RatingFilter = 'all' | 'below_3' | '3_to_4' | 'above_4'
type ResponseFilter = 'all' | 'below_50' | '50_to_80' | 'above_80'
type TypeFilter = 'all' | 'place' | 'practitioner' | 'service_area'

export function OrgReportDashboard({ orgSlug, summary, sentimentCounts, locations, daily }: Props) {
  const [sortField, setSortField] = useState<SortField>('health')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [chartMetric, setChartMetric] = useState<ChartMetric>('actions')
  const [healthFilter, setHealthFilter] = useState<'all' | 'healthy' | 'attention' | 'at_risk'>('all')
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all')
  const [responseFilter, setResponseFilter] = useState<ResponseFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  const exportCsv = () => {
    const headers = ['Location', 'City', 'State', 'Type', 'Avg Rating', 'Total Reviews', 'Reviews (30d)', 'Response Rate', 'Days Since Last Review', 'GBP Actions (30d)', 'GBP Actions Trend', 'GBP Impressions (30d)', 'SoLV', 'Health']
    const rows = sorted.map((l) => [
      l.name, l.city || '', l.state || '', l.type,
      l.avg_rating ?? '', l.total_reviews, l.reviews_30d, `${l.response_rate}%`,
      l.days_since_last_review ?? '', l.gbp_actions_30d, `${l.gbp_actions_trend}%`,
      l.gbp_impressions_30d, l.solv ?? '', l.health,
    ])
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${orgSlug}-locations-report.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const healthOrder = { at_risk: 3, attention: 2, healthy: 1 }
  const filteredLocations = locations.filter((l) => {
    if (healthFilter !== 'all' && l.health !== healthFilter) return false
    if (ratingFilter === 'below_3' && (l.avg_rating === null || l.avg_rating >= 3)) return false
    if (ratingFilter === '3_to_4' && (l.avg_rating === null || l.avg_rating < 3 || l.avg_rating >= 4)) return false
    if (ratingFilter === 'above_4' && (l.avg_rating === null || l.avg_rating < 4)) return false
    if (responseFilter === 'below_50' && l.response_rate >= 50) return false
    if (responseFilter === '50_to_80' && (l.response_rate < 50 || l.response_rate >= 80)) return false
    if (responseFilter === 'above_80' && l.response_rate < 80) return false
    if (typeFilter !== 'all' && l.type !== typeFilter) return false
    return true
  })

  const sorted = [...filteredLocations].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortField === 'name') return dir * a.name.localeCompare(b.name)
    if (sortField === 'avg_rating') return dir * ((a.avg_rating || 0) - (b.avg_rating || 0))
    if (sortField === 'reviews_30d') return dir * (a.reviews_30d - b.reviews_30d)
    if (sortField === 'response_rate') return dir * (a.response_rate - b.response_rate)
    if (sortField === 'gbp_actions_30d') return dir * (a.gbp_actions_30d - b.gbp_actions_30d)
    if (sortField === 'solv') return dir * ((a.solv || 0) - (b.solv || 0))
    if (sortField === 'health') return dir * (healthOrder[a.health] - healthOrder[b.health])
    return 0
  })

  const sentimentTotal = sentimentCounts.positive + sentimentCounts.neutral + sentimentCounts.negative

  return (
    <div className="space-y-8">
      {/* Hero Stats */}
      <div className={`grid grid-cols-2 gap-4 ${summary.avg_solv !== null ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        {summary.avg_solv !== null && (
          <HeroStat
            label="Avg SoLV"
            value={`${summary.avg_solv}%`}
            sub={`Share of Local Voice · ${summary.locations_with_solv} tracked`}
            solv={summary.avg_solv}
          />
        )}
        <HeroStat
          label="Total Actions"
          value={formatNumber(summary.total_gbp_actions)}
          sub="Calls + directions + clicks"
          trend={summary.gbp_actions_trend}
        />
        <HeroStat
          label="Avg Rating"
          value={summary.avg_rating !== null ? summary.avg_rating.toFixed(1) : '--'}
          sub={`Across ${summary.total_locations} location${summary.total_locations !== 1 ? 's' : ''}`}
          ratingStars={summary.avg_rating}
        />
        <HeroStat
          label="New Reviews"
          value={String(summary.reviews_30d)}
          sub={`${summary.total_reviews} total`}
        />
        <HeroStat
          label="Response Rate"
          value={`${summary.response_rate}%`}
          sub={`${summary.total_reviews} reviews`}
          responseRate={summary.response_rate}
        />
      </div>

      {/* Location Health Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <button
          onClick={() => setHealthFilter(healthFilter === 'healthy' ? 'all' : 'healthy')}
          className={`border rounded-xl p-4 text-left transition-colors ${
            healthFilter === 'healthy' ? 'border-emerald-400 bg-emerald-50/50' : 'border-warm-border hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-warm-gray">Healthy</span>
          </div>
          <div className="text-2xl font-serif text-ink">{summary.locations_healthy}</div>
          <div className="text-[10px] text-warm-gray mt-0.5">
            of {summary.total_locations} locations
          </div>
        </button>
        <button
          onClick={() => setHealthFilter(healthFilter === 'attention' ? 'all' : 'attention')}
          className={`border rounded-xl p-4 text-left transition-colors ${
            healthFilter === 'attention' ? 'border-amber-400 bg-amber-50/50' : 'border-warm-border hover:border-amber-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-xs text-warm-gray">Needs Attention</span>
          </div>
          <div className="text-2xl font-serif text-ink">{summary.locations_attention}</div>
          <div className="text-[10px] text-warm-gray mt-0.5">
            of {summary.total_locations} locations
          </div>
        </button>
        <button
          onClick={() => setHealthFilter(healthFilter === 'at_risk' ? 'all' : 'at_risk')}
          className={`border rounded-xl p-4 text-left transition-colors ${
            healthFilter === 'at_risk' ? 'border-red-400 bg-red-50/50' : 'border-warm-border hover:border-red-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-xs text-warm-gray">At Risk</span>
          </div>
          <div className="text-2xl font-serif text-ink">{summary.locations_at_risk}</div>
          <div className="text-[10px] text-warm-gray mt-0.5">
            of {summary.total_locations} locations
          </div>
        </button>
      </div>

      {/* Action Items — locations needing attention */}
      {(() => {
        const actionable = locations
          .filter((l) => l.health === 'at_risk' || l.health === 'attention')
          .sort((a, b) => {
            const order = { at_risk: 2, attention: 1, healthy: 0 }
            return order[b.health] - order[a.health]
          })
          .slice(0, 4)
          .map((l) => {
            const reasons: string[] = []
            if (l.avg_rating !== null && l.avg_rating < 3.0) reasons.push(`Rating ${l.avg_rating.toFixed(1)}`)
            else if (l.avg_rating !== null && l.avg_rating < 4.0) reasons.push(`Rating ${l.avg_rating.toFixed(1)}`)
            if (l.days_since_last_review !== null && l.days_since_last_review > 30) reasons.push(`No reviews in ${l.days_since_last_review}d`)
            if (l.response_rate < 50 && l.total_reviews > 0) reasons.push(`${l.response_rate}% reply rate`)
            if (l.gbp_actions_trend < -10) reasons.push(`Actions ${l.gbp_actions_trend}%`)
            return { ...l, reasons }
          })

        if (actionable.length === 0) return null

        return (
          <div className="border border-warm-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-warm-border bg-warm-light/30 flex items-center justify-between">
              <h2 className="text-sm font-medium text-ink">
                {actionable.length} location{actionable.length !== 1 ? 's' : ''} need{actionable.length === 1 ? 's' : ''} attention
              </h2>
              <button
                onClick={() => setHealthFilter(healthFilter === 'at_risk' ? 'all' : 'at_risk')}
                className="text-[10px] text-warm-gray hover:text-ink transition-colors"
              >
                View all at-risk
              </button>
            </div>
            <div className="divide-y divide-warm-border/50">
              {actionable.map((l) => (
                <Link
                  key={l.id}
                  href={`/admin/${orgSlug}/locations/${l.id}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-warm-light/50 transition-colors no-underline"
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${l.health === 'at_risk' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink font-medium truncate">{l.name}</div>
                    <div className="text-[10px] text-warm-gray">{[l.city, l.state].filter(Boolean).join(', ')}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {l.reasons.slice(0, 2).map((r, i) => (
                      <span key={i} className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                        l.health === 'at_risk'
                          ? 'text-red-700 bg-red-50 border-red-200'
                          : 'text-amber-700 bg-amber-50 border-amber-200'
                      }`}>
                        {r}
                      </span>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* GBP Performance Chart */}
        <div className="lg:col-span-2 border border-warm-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-ink">GBP Performance</h2>
            <div className="flex gap-1">
              {([
                { key: 'actions', label: 'Actions' },
                { key: 'impressions', label: 'Impressions' },
                { key: 'calls', label: 'Calls' },
                { key: 'directions', label: 'Directions' },
                { key: 'clicks', label: 'Web Clicks' },
              ] as const).map((m) => (
                <button
                  key={m.key}
                  onClick={() => setChartMetric(m.key)}
                  className={`px-2.5 py-1 text-[10px] rounded-full transition-colors ${
                    chartMetric === m.key ? 'bg-ink text-cream' : 'text-warm-gray hover:text-ink'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {daily.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={daily} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1A1A1A" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#1A1A1A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => new Date(d + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  tick={{ fontSize: 10, fill: '#9A9488' }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#9A9488' }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  tickFormatter={formatNumber}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #D5CFC5' }}
                  labelFormatter={(d) => new Date(d + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [formatNumber(Number(value)), chartMetric === 'actions' ? 'Actions' : chartMetric === 'impressions' ? 'Impressions' : chartMetric === 'calls' ? 'Calls' : chartMetric === 'directions' ? 'Directions' : 'Web Clicks']}
                />
                <Area
                  type="monotone"
                  dataKey={chartMetric}
                  stroke="#1A1A1A"
                  strokeWidth={1.5}
                  fill="url(#chartGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-xs text-warm-gray">
              No GBP data yet. Metrics sync daily.
            </div>
          )}
        </div>

        {/* Sentiment Breakdown */}
        <div className="border border-warm-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-ink mb-4">Review Sentiment</h2>
          {sentimentTotal > 0 ? (
            <div>
              {/* Stacked bar */}
              <div className="flex rounded-full overflow-hidden h-3 mb-4">
                {sentimentCounts.positive > 0 && (
                  <div
                    className="bg-emerald-500 transition-all"
                    style={{ width: `${(sentimentCounts.positive / sentimentTotal) * 100}%` }}
                  />
                )}
                {sentimentCounts.neutral > 0 && (
                  <div
                    className="bg-warm-gray/40 transition-all"
                    style={{ width: `${(sentimentCounts.neutral / sentimentTotal) * 100}%` }}
                  />
                )}
                {sentimentCounts.negative > 0 && (
                  <div
                    className="bg-red-500 transition-all"
                    style={{ width: `${(sentimentCounts.negative / sentimentTotal) * 100}%` }}
                  />
                )}
              </div>
              <div className="space-y-2.5">
                <SentimentRow label="Positive" count={sentimentCounts.positive} total={sentimentTotal} color="bg-emerald-500" />
                <SentimentRow label="Neutral" count={sentimentCounts.neutral} total={sentimentTotal} color="bg-warm-gray/40" />
                <SentimentRow label="Negative" count={sentimentCounts.negative} total={sentimentTotal} color="bg-red-500" />
              </div>
              <div className="mt-4 pt-3 border-t border-warm-border/50">
                <div className="flex items-center justify-between text-[10px] text-warm-gray">
                  <span>Impressions (30d)</span>
                  <span className="font-mono text-ink">{formatNumber(summary.total_impressions)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-xs text-warm-gray">
              No reviews with sentiment data yet.
            </div>
          )}
        </div>
      </div>

      {/* Location Table */}
      <div className="border border-warm-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-warm-border bg-warm-light/30">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-ink">
              Locations
              {filteredLocations.length !== locations.length && (
                <span className="text-warm-gray font-normal ml-2">
                  {filteredLocations.length} of {locations.length}
                  <button
                    onClick={() => { setHealthFilter('all'); setRatingFilter('all'); setResponseFilter('all'); setTypeFilter('all') }}
                    className="ml-2 text-[10px] text-warm-gray hover:text-ink underline"
                  >
                    Clear all
                  </button>
                </span>
              )}
            </h2>
            <button
              onClick={exportCsv}
              className="text-[10px] text-warm-gray hover:text-ink transition-colors"
            >
              Export CSV
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={ratingFilter}
              onChange={(e) => setRatingFilter(e.target.value as RatingFilter)}
              className={`text-[10px] bg-transparent border rounded-full px-2.5 py-1 outline-none transition-colors ${
                ratingFilter !== 'all' ? 'border-ink text-ink font-medium' : 'border-warm-border text-warm-gray'
              }`}
            >
              <option value="all">All Ratings</option>
              <option value="below_3">Below 3.0</option>
              <option value="3_to_4">3.0 - 3.9</option>
              <option value="above_4">4.0+</option>
            </select>
            <select
              value={responseFilter}
              onChange={(e) => setResponseFilter(e.target.value as ResponseFilter)}
              className={`text-[10px] bg-transparent border rounded-full px-2.5 py-1 outline-none transition-colors ${
                responseFilter !== 'all' ? 'border-ink text-ink font-medium' : 'border-warm-border text-warm-gray'
              }`}
            >
              <option value="all">All Response Rates</option>
              <option value="below_50">Below 50%</option>
              <option value="50_to_80">50% - 79%</option>
              <option value="above_80">80%+</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
              className={`text-[10px] bg-transparent border rounded-full px-2.5 py-1 outline-none transition-colors ${
                typeFilter !== 'all' ? 'border-ink text-ink font-medium' : 'border-warm-border text-warm-gray'
              }`}
            >
              <option value="all">All Types</option>
              <option value="place">Place</option>
              <option value="practitioner">Practitioner</option>
              <option value="service_area">Service Area</option>
            </select>
          </div>
        </div>

        {/* Desktop table */}
        <div className="hidden lg:block">
          {/* Table header */}
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_80px_1fr_80px] gap-4 px-5 py-2 text-[10px] text-warm-gray uppercase tracking-wider border-b border-warm-border/50">
            <SortHeader label="Location" field="name" current={sortField} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Rating" field="avg_rating" current={sortField} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Reviews (30d)" field="reviews_30d" current={sortField} dir={sortDir} onSort={handleSort} />
            <SortHeader label="GBP Actions" field="gbp_actions_30d" current={sortField} dir={sortDir} onSort={handleSort} />
            <SortHeader label="SoLV" field="solv" current={sortField} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Response Rate" field="response_rate" current={sortField} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Health" field="health" current={sortField} dir={sortDir} onSort={handleSort} />
          </div>

          {/* Table rows */}
          <div className="divide-y divide-warm-border/50">
            {sorted.map((loc) => (
              <Link
                key={loc.id}
                href={`/admin/${orgSlug}/locations/${loc.id}/reports`}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_80px_1fr_80px] gap-4 px-5 py-3 hover:bg-warm-light/50 transition-colors no-underline items-center"
              >
                {/* Location name */}
                <div>
                  <div className="text-sm text-ink font-medium">{loc.name}</div>
                  <div className="text-[10px] text-warm-gray">
                    {[loc.city, loc.state].filter(Boolean).join(', ')}
                  </div>
                </div>

                {/* Rating */}
                <div className="flex items-center gap-1.5">
                  {loc.avg_rating !== null ? (
                    <>
                      <span className="text-sm font-medium text-ink">{loc.avg_rating.toFixed(1)}</span>
                      <span className="text-amber-400 text-xs">★</span>
                      <span className="text-[10px] text-warm-gray">({loc.total_reviews})</span>
                    </>
                  ) : (
                    <span className="text-xs text-warm-gray">No reviews</span>
                  )}
                </div>

                {/* Reviews 30d */}
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-ink">{loc.reviews_30d}</span>
                  {loc.days_since_last_review !== null && (
                    <span className={`text-[10px] ${loc.days_since_last_review > 30 ? 'text-red-500' : loc.days_since_last_review > 14 ? 'text-amber-500' : 'text-warm-gray'}`}>
                      {loc.days_since_last_review}d ago
                    </span>
                  )}
                </div>

                {/* GBP Actions */}
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-ink">{formatNumber(loc.gbp_actions_30d)}</span>
                  {loc.gbp_actions_trend !== 0 && (
                    <TrendBadge trend={loc.gbp_actions_trend} />
                  )}
                </div>

                {/* SoLV */}
                <div>
                  {loc.solv !== null ? (
                    <span className={`text-sm font-medium ${loc.solv >= 50 ? 'text-emerald-600' : loc.solv >= 25 ? 'text-amber-600' : 'text-red-500'}`}>
                      {Math.round(loc.solv)}%
                    </span>
                  ) : (
                    <span className="text-[10px] text-warm-gray">--</span>
                  )}
                </div>

                {/* Response Rate */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-warm-light rounded-full overflow-hidden max-w-[80px]">
                    <div
                      className={`h-full rounded-full ${loc.response_rate >= 80 ? 'bg-emerald-500' : loc.response_rate >= 50 ? 'bg-amber-500' : 'bg-red-400'}`}
                      style={{ width: `${loc.response_rate}%` }}
                    />
                  </div>
                  <span className="text-xs text-warm-gray">{loc.response_rate}%</span>
                </div>

                {/* Health */}
                <div>
                  <HealthBadge health={loc.health} />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Mobile sort */}
        <div className="lg:hidden px-4 py-2 border-b border-warm-border/50 flex items-center justify-between">
          <select
            value={sortField}
            onChange={(e) => { setSortField(e.target.value as SortField); setSortDir('desc') }}
            className="text-xs bg-transparent text-warm-gray outline-none"
          >
            <option value="health">Sort by Health</option>
            <option value="name">Sort by Name</option>
            <option value="avg_rating">Sort by Rating</option>
            <option value="reviews_30d">Sort by Reviews</option>
            <option value="response_rate">Sort by Response Rate</option>
            <option value="gbp_actions_30d">Sort by Actions</option>
            <option value="solv">Sort by SoLV</option>
          </select>
          <button
            onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
            className="text-xs text-warm-gray hover:text-ink transition-colors"
          >
            {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
          </button>
        </div>

        {/* Mobile cards */}
        <div className="lg:hidden divide-y divide-warm-border/50">
          {sorted.map((loc) => (
            <Link
              key={loc.id}
              href={`/admin/${orgSlug}/locations/${loc.id}/reports`}
              className="block px-4 py-4 hover:bg-warm-light/50 transition-colors no-underline"
            >
              {/* Header row: name + health dot */}
              <div className="flex items-start justify-between mb-1">
                <div>
                  <div className="text-sm text-ink font-medium">{loc.name}</div>
                  <div className="text-[10px] text-warm-gray">
                    {[loc.city, loc.state].filter(Boolean).join(', ')}
                  </div>
                </div>
                <HealthBadge health={loc.health} />
              </div>

              {/* Key metrics row */}
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div>
                  <div className="flex items-center gap-1">
                    {loc.avg_rating !== null ? (
                      <>
                        <span className="text-lg font-serif text-ink">{loc.avg_rating.toFixed(1)}</span>
                        <span className="text-amber-400 text-xs">★</span>
                      </>
                    ) : (
                      <span className="text-sm text-warm-gray">--</span>
                    )}
                  </div>
                  <div className="text-[10px] text-warm-gray mt-0.5">rating</div>
                </div>
                <div>
                  <div className="text-lg font-serif text-ink">{loc.reviews_30d}</div>
                  <div className="text-[10px] text-warm-gray mt-0.5">reviews (30d)</div>
                </div>
                <div>
                  <div className={`text-lg font-serif ${loc.response_rate >= 80 ? 'text-emerald-600' : loc.response_rate >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                    {loc.response_rate}%
                  </div>
                  <div className="text-[10px] text-warm-gray mt-0.5">replied</div>
                </div>
              </div>

              {/* Secondary metrics row */}
              <div className="flex items-center gap-4 mt-2 pt-2 border-t border-warm-border/30">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-ink">{formatNumber(loc.gbp_actions_30d)}</span>
                  <span className="text-[10px] text-warm-gray">actions</span>
                  {loc.gbp_actions_trend !== 0 && <TrendBadge trend={loc.gbp_actions_trend} />}
                </div>
                {loc.solv !== null && (
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-medium ${loc.solv >= 50 ? 'text-emerald-600' : loc.solv >= 25 ? 'text-amber-600' : 'text-red-500'}`}>
                      {Math.round(loc.solv)}%
                    </span>
                    <span className="text-[10px] text-warm-gray">SoLV</span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>

        {sorted.length === 0 && (
          <div className="px-5 py-8 text-center text-xs text-warm-gray">
            No locations match this filter.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────

function HeroStat({
  label,
  value,
  sub,
  trend,
  ratingStars,
  responseRate,
  solv,
}: {
  label: string
  value: string
  sub: string
  trend?: number
  ratingStars?: number | null
  responseRate?: number
  solv?: number
}) {
  return (
    <div className="border border-warm-border rounded-xl p-4">
      <div className="text-[10px] text-warm-gray uppercase tracking-wider mb-1.5">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-serif text-ink leading-none">{value}</span>
        {trend !== undefined && trend !== 0 && <TrendBadge trend={trend} />}
      </div>
      {ratingStars != null && ratingStars > 0 && (
        <div className="flex gap-0.5 mt-1.5">
          {[1, 2, 3, 4, 5].map((s) => (
            <span key={s} className={`text-xs ${s <= Math.round(ratingStars) ? 'text-amber-400' : 'text-warm-border'}`}>★</span>
          ))}
        </div>
      )}
      {solv !== undefined && (
        <div className="mt-1.5 h-1.5 bg-warm-light rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${solv >= 50 ? 'bg-emerald-500' : solv >= 25 ? 'bg-amber-500' : 'bg-red-400'}`}
            style={{ width: `${solv}%` }}
          />
        </div>
      )}
      {responseRate !== undefined && (
        <div className="mt-1.5 h-1.5 bg-warm-light rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${responseRate >= 80 ? 'bg-emerald-500' : responseRate >= 50 ? 'bg-amber-500' : 'bg-red-400'}`}
            style={{ width: `${responseRate}%` }}
          />
        </div>
      )}
      <div className="text-[10px] text-warm-gray mt-1.5">{sub}</div>
    </div>
  )
}

function TrendBadge({ trend }: { trend: number }) {
  const isUp = trend > 0
  return (
    <span className={`text-[10px] font-medium ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
      {isUp ? '+' : ''}{trend}%
    </span>
  )
}

function HealthBadge({ health }: { health: string }) {
  const config: Record<string, { label: string; classes: string }> = {
    healthy: { label: 'Healthy', classes: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    attention: { label: 'Attention', classes: 'text-amber-700 bg-amber-50 border-amber-200' },
    at_risk: { label: 'At Risk', classes: 'text-red-700 bg-red-50 border-red-200' },
  }
  const c = config[health] || config.healthy
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${c.classes}`}>
      {c.label}
    </span>
  )
}

function SentimentRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <div className={`w-2 h-2 rounded-full ${color} shrink-0`} />
      <span className="text-xs text-ink flex-1">{label}</span>
      <span className="text-xs font-mono text-ink">{count}</span>
      <span className="text-[10px] text-warm-gray w-8 text-right">{pct}%</span>
    </div>
  )
}

function SortHeader({
  label,
  field,
  current,
  dir,
  onSort,
}: {
  label: string
  field: SortField
  current: SortField
  dir: SortDir
  onSort: (f: SortField) => void
}) {
  const isActive = current === field
  return (
    <button
      onClick={() => onSort(field)}
      className={`text-left text-[10px] uppercase tracking-wider transition-colors ${
        isActive ? 'text-ink font-medium' : 'text-warm-gray hover:text-ink'
      }`}
    >
      {label}
      {isActive && <span className="ml-0.5">{dir === 'asc' ? '↑' : '↓'}</span>}
    </button>
  )
}

// ─── Helpers ──────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}
