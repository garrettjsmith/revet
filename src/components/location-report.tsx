'use client'

import { useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────

interface MetricPair {
  value: number
  previous: number
}

interface DailyData {
  date: string
  impressions: number
  calls: number
  directions: number
  clicks: number
  actions: number
}

interface RecentReview {
  id: string
  rating: number | null
  published_at: string
  reply_body: string | null
  sentiment: string | null
  platform: string
  reviewer_name: string | null
  reviewer_photo_url?: string | null
  body: string | null
  status: string
}

interface GeoGridScan {
  keyword: string
  grid_size: number
  solv: number | null
  arp: number | null
  atrp: number | null
  grid_data: Array<{ lat: number; lng: number; rank: number }>
  competitors: Array<{ name: string; solv?: number; arp?: number; review_count?: number; rating?: number }>
  scanned_at: string
}

interface SearchKeyword {
  keyword: string
  impressions: number | null
  threshold: number | null
}

interface Props {
  orgSlug: string
  locationId: string
  gbpMetrics: {
    impressions: MetricPair
    calls: MetricPair
    directions: MetricPair
    clicks: MetricPair
    actions: MetricPair
  }
  daily: DailyData[]
  avgRating: number | null
  totalReviews: number
  reviews30d: number
  responseRate: number
  daysSinceLastReview: number | null
  ratingDist: { star: number; count: number }[]
  sentimentCounts: { positive: number; neutral: number; negative: number }
  reviewVelocity: { month: string; count: number }[]
  recentReviews: RecentReview[]
  profileFields: { label: string; filled: boolean }[]
  profileComplete: number
  profileTotal: number
  platformCounts: Record<string, number>
  geoGridScan?: GeoGridScan | null
  searchKeywords?: SearchKeyword[]
}

type ChartMetric = 'actions' | 'impressions' | 'calls' | 'directions' | 'clicks'

// ─── Component ────────────────────────────────────────────

export function LocationReportView({
  orgSlug,
  locationId,
  gbpMetrics,
  daily,
  avgRating,
  totalReviews,
  reviews30d,
  responseRate,
  daysSinceLastReview,
  ratingDist,
  sentimentCounts,
  reviewVelocity,
  recentReviews,
  profileFields,
  profileComplete,
  profileTotal,
  platformCounts,
  geoGridScan,
  searchKeywords = [],
}: Props) {
  const [chartMetric, setChartMetric] = useState<ChartMetric>('actions')

  const sentimentTotal = sentimentCounts.positive + sentimentCounts.neutral + sentimentCounts.negative
  const maxRatingCount = Math.max(...ratingDist.map((d) => d.count), 1)

  return (
    <div className="space-y-8">
      {/* GBP Performance Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard label="Total Actions" metric={gbpMetrics.actions} />
        <MetricCard label="Impressions" metric={gbpMetrics.impressions} />
        <MetricCard label="Calls" metric={gbpMetrics.calls} />
        <MetricCard label="Directions" metric={gbpMetrics.directions} />
        <MetricCard label="Web Clicks" metric={gbpMetrics.clicks} />
      </div>

      {/* GBP Trend Chart */}
      <div className="border border-warm-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-ink">GBP Performance Trend</h2>
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
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={daily} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="locChartGrad" x1="0" y1="0" x2="0" y2="1">
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
                formatter={(value: any) => [formatNumber(Number(value))]}
              />
              <Area
                type="monotone"
                dataKey={chartMetric}
                stroke="#1A1A1A"
                strokeWidth={1.5}
                fill="url(#locChartGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[260px] flex items-center justify-center text-xs text-warm-gray">
            No GBP data yet. Metrics sync daily.
          </div>
        )}
      </div>

      {/* Rank Tracking + Search Keywords Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Geo-Grid Rank Visualization */}
        <div className="border border-warm-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-ink mb-1">Local Rank Grid</h2>
          {geoGridScan ? (
            <>
              <p className="text-[10px] text-warm-gray mb-4">
                Keyword: <span className="text-ink">{geoGridScan.keyword}</span>
                {' · '}
                {new Date(geoGridScan.scanned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>

              {/* SoLV + ARP metrics */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-serif text-ink">
                    {geoGridScan.solv != null ? `${Math.round(geoGridScan.solv)}%` : '--'}
                  </div>
                  <div className="text-[10px] text-warm-gray">SoLV</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-serif text-ink">
                    {geoGridScan.arp != null ? geoGridScan.arp.toFixed(1) : '--'}
                  </div>
                  <div className="text-[10px] text-warm-gray">Avg Rank</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-serif text-ink">
                    {geoGridScan.atrp != null ? geoGridScan.atrp.toFixed(1) : '--'}
                  </div>
                  <div className="text-[10px] text-warm-gray">ATRP</div>
                </div>
              </div>

              {/* Grid visualization */}
              <GeoGrid points={geoGridScan.grid_data} gridSize={geoGridScan.grid_size} />

              {/* Competitors */}
              {geoGridScan.competitors && geoGridScan.competitors.length > 0 && (
                <div className="mt-4 pt-3 border-t border-warm-border/50">
                  <div className="text-[10px] text-warm-gray uppercase tracking-wider mb-2">Top Competitors</div>
                  <div className="space-y-1.5">
                    {geoGridScan.competitors.slice(0, 5).map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-ink truncate flex-1">{c.name}</span>
                        {c.solv != null && <span className="text-warm-gray ml-2">{Math.round(c.solv)}% SoLV</span>}
                        {c.rating != null && <span className="text-amber-400 ml-2">{c.rating.toFixed(1)} ★</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="h-[280px] flex flex-col items-center justify-center text-xs text-warm-gray">
              <p>No rank tracking data yet.</p>
              <p className="text-[10px] mt-1">Connect LocalFalcon to see geo-grid rankings.</p>
            </div>
          )}
        </div>

        {/* Search Keywords */}
        <div className="border border-warm-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-ink mb-1">Top Search Keywords</h2>
          <p className="text-[10px] text-warm-gray mb-4">What people searched to find this business</p>
          {searchKeywords.length > 0 ? (
            <div className="space-y-0">
              {/* Header */}
              <div className="flex items-center justify-between pb-2 border-b border-warm-border/50 text-[10px] text-warm-gray uppercase tracking-wider">
                <span>Keyword</span>
                <span>Impressions</span>
              </div>
              {searchKeywords.map((kw, i) => {
                const maxImpressions = searchKeywords[0]?.impressions || 1
                const barWidth = kw.impressions != null ? (kw.impressions / maxImpressions) * 100 : 0
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 py-1.5 border-b border-warm-border/20"
                  >
                    <span className="text-xs text-ink flex-1 truncate">{kw.keyword}</span>
                    <div className="flex items-center gap-2 w-[120px] shrink-0 justify-end">
                      {kw.impressions != null ? (
                        <>
                          <div className="w-[60px] h-1.5 bg-warm-light rounded-full overflow-hidden">
                            <div
                              className="h-full bg-ink/40 rounded-full"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono text-warm-gray w-10 text-right">
                            {formatNumber(kw.impressions)}
                          </span>
                        </>
                      ) : (
                        <span className="text-[10px] text-warm-gray">
                          &lt; {kw.threshold || 15}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="h-[280px] flex flex-col items-center justify-center text-xs text-warm-gray">
              <p>No keyword data yet.</p>
              <p className="text-[10px] mt-1">Keywords sync monthly from GBP.</p>
            </div>
          )}
        </div>
      </div>

      {/* Review Health Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Review Summary */}
        <div className="border border-warm-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-ink mb-4">Review Health</h2>

          <div className="text-center mb-4">
            {avgRating !== null ? (
              <>
                <div className="text-4xl font-serif text-ink">{avgRating.toFixed(1)}</div>
                <div className="flex justify-center gap-0.5 mt-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <span key={s} className={`text-lg ${s <= Math.round(avgRating) ? 'text-amber-400' : 'text-warm-border'}`}>★</span>
                  ))}
                </div>
                <div className="text-xs text-warm-gray mt-1">{totalReviews} reviews</div>
              </>
            ) : (
              <div className="text-sm text-warm-gray py-4">No reviews yet</div>
            )}
          </div>

          <div className="space-y-2 mb-4">
            <StatRow label="New reviews (30d)" value={String(reviews30d)} />
            <StatRow
              label="Last review"
              value={daysSinceLastReview !== null ? `${daysSinceLastReview}d ago` : 'Never'}
              warn={daysSinceLastReview !== null && daysSinceLastReview > 30}
            />
            <StatRow label="Response rate" value={`${responseRate}%`} warn={responseRate < 50} />
          </div>

          {/* Platform breakdown */}
          {Object.keys(platformCounts).length > 0 && (
            <div className="pt-3 border-t border-warm-border/50">
              <div className="text-[10px] text-warm-gray uppercase tracking-wider mb-2">By Platform</div>
              <div className="space-y-1.5">
                {Object.entries(platformCounts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([platform, count]) => (
                    <div key={platform} className="flex items-center justify-between">
                      <span className="text-xs text-ink capitalize">{platform}</span>
                      <span className="text-xs font-mono text-warm-gray">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Rating Distribution */}
        <div className="border border-warm-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-ink mb-4">Rating Distribution</h2>

          <div className="space-y-2">
            {ratingDist.map((d) => (
              <div key={d.star} className="flex items-center gap-2">
                <span className="text-xs text-warm-gray w-4 text-right">{d.star}</span>
                <span className="text-amber-400 text-xs">★</span>
                <div className="flex-1 h-3 bg-warm-light rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all"
                    style={{ width: `${(d.count / maxRatingCount) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-warm-gray w-8 text-right">{d.count}</span>
              </div>
            ))}
          </div>

          {/* Sentiment */}
          {sentimentTotal > 0 && (
            <div className="mt-6 pt-4 border-t border-warm-border/50">
              <div className="text-[10px] text-warm-gray uppercase tracking-wider mb-3">Sentiment</div>
              <div className="flex rounded-full overflow-hidden h-2.5 mb-3">
                {sentimentCounts.positive > 0 && (
                  <div className="bg-emerald-500" style={{ width: `${(sentimentCounts.positive / sentimentTotal) * 100}%` }} />
                )}
                {sentimentCounts.neutral > 0 && (
                  <div className="bg-warm-gray/30" style={{ width: `${(sentimentCounts.neutral / sentimentTotal) * 100}%` }} />
                )}
                {sentimentCounts.negative > 0 && (
                  <div className="bg-red-500" style={{ width: `${(sentimentCounts.negative / sentimentTotal) * 100}%` }} />
                )}
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-emerald-600">{sentimentCounts.positive} positive</span>
                <span className="text-warm-gray">{sentimentCounts.neutral} neutral</span>
                <span className="text-red-500">{sentimentCounts.negative} negative</span>
              </div>
            </div>
          )}
        </div>

        {/* Review Velocity + Profile Completeness */}
        <div className="space-y-6">
          {/* Velocity Chart */}
          <div className="border border-warm-border rounded-xl p-5">
            <h2 className="text-sm font-medium text-ink mb-4">Review Velocity</h2>
            {reviewVelocity.some((v) => v.count > 0) ? (
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={reviewVelocity} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 9, fill: '#9A9488' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #D5CFC5' }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any) => [Number(value), 'Reviews']}
                  />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {reviewVelocity.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={i === reviewVelocity.length - 1 ? '#1A1A1A' : '#D5CFC5'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[120px] flex items-center justify-center text-xs text-warm-gray">
                No review history yet.
              </div>
            )}
          </div>

          {/* Profile Completeness */}
          {profileFields.length > 0 && (
            <div className="border border-warm-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-ink">Profile Completeness</h2>
                <span className="text-xs font-mono text-warm-gray">{profileComplete}/{profileTotal}</span>
              </div>
              <div className="h-2 bg-warm-light rounded-full overflow-hidden mb-3">
                <div
                  className={`h-full rounded-full ${profileComplete === profileTotal ? 'bg-emerald-500' : 'bg-amber-400'}`}
                  style={{ width: `${(profileComplete / profileTotal) * 100}%` }}
                />
              </div>
              <div className="space-y-1.5">
                {profileFields.map((f) => (
                  <div key={f.label} className="flex items-center gap-2 text-xs">
                    <div className={`w-1.5 h-1.5 rounded-full ${f.filled ? 'bg-emerald-500' : 'bg-red-400'}`} />
                    <span className={f.filled ? 'text-warm-gray' : 'text-ink'}>{f.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Reviews */}
      {recentReviews.length > 0 && (
        <div className="border border-warm-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-warm-border bg-warm-light/30">
            <h2 className="text-sm font-medium text-ink">Recent Reviews</h2>
          </div>
          <div className="divide-y divide-warm-border/50">
            {recentReviews.map((review) => (
              <div key={review.id} className="px-5 py-3">
                <div className="flex items-start gap-3">
                  {review.reviewer_photo_url ? (
                    <img src={review.reviewer_photo_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-warm-light flex items-center justify-center text-warm-gray text-[10px] font-bold shrink-0">
                      {(review.reviewer_name || 'A')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-ink">{review.reviewer_name || 'Anonymous'}</span>
                      {review.rating != null && (
                        <span className="text-[10px] text-amber-400">
                          {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                        </span>
                      )}
                      <span className="text-[10px] text-warm-gray capitalize">{review.platform}</span>
                      <span className="text-[10px] text-warm-gray">
                        {new Date(review.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    {review.body && (
                      <p className="text-xs text-ink/70 line-clamp-2">{review.body}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {review.sentiment && (
                        <span className={`text-[10px] ${
                          review.sentiment === 'positive' ? 'text-emerald-600' :
                          review.sentiment === 'negative' ? 'text-red-500' : 'text-warm-gray'
                        }`}>
                          {review.sentiment}
                        </span>
                      )}
                      {review.reply_body ? (
                        <span className="text-[10px] text-emerald-600">Replied</span>
                      ) : (
                        <span className="text-[10px] text-warm-gray">No reply</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────

function MetricCard({ label, metric }: { label: string; metric: { value: number; previous: number } }) {
  const trend = metric.previous > 0
    ? Math.round(((metric.value - metric.previous) / metric.previous) * 100)
    : 0

  return (
    <div className="border border-warm-border rounded-xl p-4">
      <div className="text-[10px] text-warm-gray uppercase tracking-wider mb-1">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-serif text-ink">{formatNumber(metric.value)}</span>
        {trend !== 0 && (
          <span className={`text-[10px] font-medium ${trend > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {trend > 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <div className="text-[10px] text-warm-gray mt-0.5">
        30d · prev {formatNumber(metric.previous)}
      </div>
    </div>
  )
}

function StatRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-warm-gray">{label}</span>
      <span className={`text-xs font-mono ${warn ? 'text-red-500' : 'text-ink'}`}>{value}</span>
    </div>
  )
}

/**
 * Geo-grid visualization — shows rank positions as a color-coded grid.
 * Green = top 3 (local pack), yellow = 4-10, red = 11+, gray = not found.
 */
function GeoGrid({ points, gridSize }: { points: Array<{ lat: number; lng: number; rank: number }>; gridSize: number }) {
  if (!points || points.length === 0) return null

  // Determine grid dimensions (e.g. 49 = 7x7)
  const side = Math.round(Math.sqrt(gridSize || points.length))

  // Sort points into a grid by lat (desc) then lng (asc) to match map orientation
  const sorted = [...points].sort((a, b) => {
    if (Math.abs(a.lat - b.lat) > 0.001) return b.lat - a.lat // top to bottom
    return a.lng - b.lng // left to right
  })

  const rankColor = (rank: number) => {
    if (rank <= 0 || rank > 20) return 'bg-warm-gray/20 text-warm-gray' // not found
    if (rank <= 3) return 'bg-emerald-500 text-white' // local pack
    if (rank <= 10) return 'bg-amber-400 text-ink' // page 1
    return 'bg-red-400 text-white' // page 2+
  }

  return (
    <div
      className="grid gap-1 mx-auto"
      style={{
        gridTemplateColumns: `repeat(${side}, 1fr)`,
        maxWidth: side * 40,
      }}
    >
      {sorted.slice(0, side * side).map((p, i) => (
        <div
          key={i}
          className={`aspect-square rounded flex items-center justify-center text-[10px] font-bold ${rankColor(p.rank)}`}
          title={`Rank ${p.rank > 20 ? '20+' : p.rank} at ${p.lat.toFixed(3)}, ${p.lng.toFixed(3)}`}
        >
          {p.rank > 0 && p.rank <= 20 ? p.rank : ''}
        </div>
      ))}
    </div>
  )
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}
