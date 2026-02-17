import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgBySlug } from '@/lib/org'
import { getLocation, checkAgencyAdmin } from '@/lib/locations'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { ProfileStats, FormTemplate, Review, GBPProfile } from '@/lib/types'
import AuditTrail from '@/components/audit-trail'
import { PerformanceMini } from '@/components/performance-mini'
import { RecentLocationTracker } from '@/components/recent-location-tracker'

export const dynamic = 'force-dynamic'

const TYPE_LABELS: Record<string, string> = {
  place: 'Place',
  practitioner: 'Practitioner',
  service_area: 'Service Area',
}

export default async function LocationDetailPage({
  params,
}: {
  params: { orgSlug: string; locationId: string }
}) {
  const org = await getOrgBySlug(params.orgSlug)
  const location = await getLocation(params.locationId, org.id)
  if (!location) notFound()

  const supabase = createServerSupabase()
  const adminClient = createAdminClient()
  const basePath = `/admin/${params.orgSlug}/locations/${params.locationId}`
  const isAgencyAdmin = await checkAgencyAdmin()

  const now = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // Run all independent queries in parallel
  const [
    { data: forms },
    { data: recentReviews },
    { count: reviewCount },
    { count: unreadReviewCount },
    { data: reviewSource },
    { data: gbpProfile },
    { data: stats },
    { data: allReviews },
  ] = await Promise.all([
    supabase
      .from('form_templates')
      .select('*')
      .eq('location_id', location.id)
      .order('created_at', { ascending: false }),
    adminClient
      .from('reviews')
      .select('*')
      .eq('location_id', location.id)
      .order('published_at', { ascending: false })
      .limit(5),
    adminClient
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('location_id', location.id),
    adminClient
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('location_id', location.id)
      .eq('status', 'new'),
    adminClient
      .from('review_sources')
      .select('total_review_count, average_rating, sync_status, last_synced_at')
      .eq('location_id', location.id)
      .eq('platform', 'google')
      .single(),
    adminClient
      .from('gbp_profiles')
      .select('business_name, primary_category_name, open_status, sync_status, last_synced_at, maps_uri')
      .eq('location_id', location.id)
      .single(),
    supabase
      .from('profile_stats')
      .select('*')
      .eq('location_id', location.id)
      .returns<ProfileStats[]>(),
    adminClient
      .from('reviews')
      .select('rating, published_at, reply_body')
      .eq('location_id', location.id),
  ])

  const formList = (forms || []) as FormTemplate[]
  const reviewList = (recentReviews || []) as Review[]
  const gbp = gbpProfile as Pick<GBPProfile, 'business_name' | 'primary_category_name' | 'open_status' | 'sync_status' | 'last_synced_at' | 'maps_uri'> | null
  const profiles = stats || []

  // Determine GBP connection status: profile row > review source > not connected
  const isGbpConnected = !!(gbp || reviewSource)
  const gbpStatusValue = gbp
    ? (gbp.open_status === 'OPEN' ? 'Open' : gbp.open_status || 'Connected')
    : reviewSource
    ? ({ active: 'Synced', error: 'Sync error', paused: 'Paused', pending: 'Pending' }[reviewSource.sync_status as string] || 'Pending')
    : 'Not linked'

  // Health calculation
  const allRevs = allReviews || []
  const totalRevs = allRevs.length
  const avgRating = reviewSource?.average_rating ? Number(reviewSource.average_rating) : null
  const repliedCount = allRevs.filter((r: any) => r.reply_body).length
  const responseRate = totalRevs > 0 ? Math.round((repliedCount / totalRevs) * 100) : 0
  const lastReviewDate = allRevs.length > 0
    ? allRevs.reduce((latest: string | null, r: any) => {
        if (!latest || (r.published_at && r.published_at > latest)) return r.published_at
        return latest
      }, null as string | null)
    : null
  const daysSinceLastReview = lastReviewDate
    ? Math.floor((now.getTime() - new Date(lastReviewDate).getTime()) / 86400000)
    : null

  let health: 'healthy' | 'attention' | 'at_risk' = 'healthy'
  const healthReasons: string[] = []
  if (avgRating !== null && avgRating < 3.0) { health = 'at_risk'; healthReasons.push('Rating below 3.0') }
  else if (avgRating !== null && avgRating < 4.0) { health = 'attention'; healthReasons.push('Rating below 4.0') }
  if (daysSinceLastReview !== null && daysSinceLastReview > 60) { health = 'at_risk'; healthReasons.push('No reviews in 60+ days') }
  else if (daysSinceLastReview !== null && daysSinceLastReview > 30 && health !== 'at_risk') { health = 'attention'; healthReasons.push('No reviews in 30+ days') }
  if (responseRate < 50 && totalRevs > 0) {
    if (health === 'healthy') health = 'attention'
    healthReasons.push(`Response rate ${responseRate}%`)
  }

  const healthConfig = {
    healthy: { label: 'Healthy', classes: 'border-emerald-200 bg-emerald-50/50', textClass: 'text-emerald-700', dotClass: 'bg-emerald-500' },
    attention: { label: 'Needs Attention', classes: 'border-amber-200 bg-amber-50/50', textClass: 'text-amber-700', dotClass: 'bg-amber-500' },
    at_risk: { label: 'At Risk', classes: 'border-red-200 bg-red-50/50', textClass: 'text-red-700', dotClass: 'bg-red-500' },
  }
  const hc = healthConfig[health]

  const statCards = [
    { label: 'Reviews', value: reviewCount || 0 },
    { label: 'Avg Rating', value: reviewSource?.average_rating ? Number(reviewSource.average_rating).toFixed(1) : '—' },
    { label: 'Unread', value: unreadReviewCount || 0 },
    { label: 'GBP Status', value: gbpStatusValue },
  ]

  return (
    <div>
      <RecentLocationTracker
        locationId={location.id}
        locationName={location.name}
        city={location.city}
        state={location.state}
        orgSlug={params.orgSlug}
        orgName={org.name}
      />
      {/* Location header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/admin/${params.orgSlug}/locations`}
              className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
            >
              Locations
            </Link>
            <span className="text-xs text-warm-gray">/</span>
          </div>
          <h1 className="text-2xl font-serif text-ink">{location.name}</h1>
          <div className="flex items-center gap-2 mt-1 text-xs text-warm-gray">
            <span>{TYPE_LABELS[location.type]}</span>
            {location.city && location.state && (
              <>
                <span className="text-warm-border">&middot;</span>
                <span>{location.city}, {location.state}</span>
              </>
            )}
            {location.email && (
              <>
                <span className="text-warm-border">&middot;</span>
                <span>{location.email}</span>
              </>
            )}
          </div>
        </div>
        <Link
          href={`${basePath}/settings`}
          className="px-4 py-2 border border-warm-border text-warm-gray text-sm rounded-full hover:text-ink hover:border-ink no-underline transition-colors"
        >
          Edit Location
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {statCards.map((s) => (
          <div key={s.label} className="bg-ink rounded-xl p-5">
            <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">{s.label}</div>
            <div className="text-2xl font-bold font-mono text-cream">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Health Status */}
      <div className={`border rounded-xl px-5 py-4 mb-8 ${hc.classes}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-2.5 h-2.5 rounded-full ${hc.dotClass}`} />
            <span className={`text-sm font-medium ${hc.textClass}`}>{hc.label}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-warm-gray">
            <span>{responseRate}% response rate</span>
            {daysSinceLastReview !== null && (
              <span>Last review {daysSinceLastReview}d ago</span>
            )}
          </div>
        </div>
        {/* Factor breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Rating factor */}
          <div className="flex items-start gap-2">
            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
              avgRating === null ? 'bg-warm-border' : avgRating >= 4.0 ? 'bg-emerald-500' : avgRating >= 3.0 ? 'bg-amber-500' : 'bg-red-500'
            }`} />
            <div>
              <div className="text-xs text-ink font-medium">
                Rating: {avgRating !== null ? avgRating.toFixed(1) : 'N/A'}
              </div>
              <div className="text-[10px] text-warm-gray">
                {avgRating === null ? 'No rating data yet'
                  : avgRating >= 4.0 ? 'Above 4.0 target'
                  : avgRating >= 3.0 ? 'Below 4.0 — aim for more positive reviews'
                  : 'Below 3.0 — address negative reviews urgently'}
              </div>
            </div>
          </div>
          {/* Recency factor */}
          <div className="flex items-start gap-2">
            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
              daysSinceLastReview === null ? 'bg-warm-border' : daysSinceLastReview <= 30 ? 'bg-emerald-500' : daysSinceLastReview <= 60 ? 'bg-amber-500' : 'bg-red-500'
            }`} />
            <div>
              <div className="text-xs text-ink font-medium">
                Recency: {daysSinceLastReview !== null ? `${daysSinceLastReview}d ago` : 'No reviews'}
              </div>
              <div className="text-[10px] text-warm-gray">
                {daysSinceLastReview === null ? 'No reviews to measure'
                  : daysSinceLastReview <= 30 ? 'Recent activity within 30 days'
                  : daysSinceLastReview <= 60 ? 'No reviews in 30+ days — request new reviews'
                  : 'No reviews in 60+ days — review generation needed'}
              </div>
            </div>
          </div>
          {/* Response rate factor */}
          <div className="flex items-start gap-2">
            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
              totalRevs === 0 ? 'bg-warm-border' : responseRate >= 50 ? 'bg-emerald-500' : 'bg-amber-500'
            }`} />
            <div>
              <div className="text-xs text-ink font-medium">
                Response rate: {responseRate}%
              </div>
              <div className="text-[10px] text-warm-gray">
                {totalRevs === 0 ? 'No reviews to respond to'
                  : responseRate >= 50 ? `Replying to ${repliedCount} of ${totalRevs} reviews`
                  : `Only ${repliedCount} of ${totalRevs} replied — reply to pending reviews`}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Google Business Profile */}
      <div className="border border-warm-border rounded-xl overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-warm-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Google Business Profile</h2>
          <Link
            href={`${basePath}/gbp-profile`}
            className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
          >
            View full profile
          </Link>
        </div>
        {gbp ? (
          <>
            <div className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                  gbp.open_status === 'OPEN' ? 'text-emerald-600' : 'text-amber-600'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    gbp.open_status === 'OPEN' ? 'bg-emerald-500' : 'bg-amber-500'
                  }`} />
                  {gbp.open_status === 'OPEN' ? 'Open' : gbp.open_status === 'CLOSED_TEMPORARILY' ? 'Temporarily Closed' : gbp.open_status || 'Unknown'}
                </span>
                {gbp.primary_category_name && (
                  <>
                    <span className="text-warm-border">&middot;</span>
                    <span className="text-xs text-warm-gray">{gbp.primary_category_name}</span>
                  </>
                )}
                {gbp.last_synced_at && (
                  <>
                    <span className="text-warm-border">&middot;</span>
                    <span className="text-xs text-warm-gray">
                      Synced {new Date(gbp.last_synced_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </>
                )}
              </div>
              {gbp.maps_uri && (
                <a
                  href={gbp.maps_uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
                >
                  Maps →
                </a>
              )}
            </div>
            <PerformanceMini locationId={location.id} />
          </>
        ) : reviewSource ? (
          <div className="px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Connected
              </span>
              <span className="text-warm-border">&middot;</span>
              <span className="text-xs text-warm-gray">
                {reviewSource.total_review_count || 0} reviews synced
              </span>
              {reviewSource.last_synced_at && (
                <>
                  <span className="text-warm-border">&middot;</span>
                  <span className="text-xs text-warm-gray">
                    Last sync {new Date(reviewSource.last_synced_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </>
              )}
            </div>
            <span className="text-[10px] text-warm-gray">
              Profile data syncs on next cycle
            </span>
          </div>
        ) : (
          <div className="p-12 text-center text-warm-gray text-sm">
            No GBP profile linked.{' '}
            <Link href="/agency/integrations" className="text-ink underline hover:no-underline">
              Connect via integrations
            </Link>
          </div>
        )}
      </div>

      {/* Reviews */}
      <div className="border border-warm-border rounded-xl overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-warm-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-ink">Reviews</h2>
            {(unreadReviewCount || 0) > 0 && (
              <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                {unreadReviewCount} new
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-warm-gray">{reviewCount || 0} total</span>
            {(reviewCount || 0) > 0 && (
              <Link
                href={`${basePath}/reviews`}
                className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
              >
                View all
              </Link>
            )}
          </div>
        </div>
        {reviewList.length === 0 ? (
          <div className="p-12 text-center text-warm-gray text-sm">
            No reviews yet. Reviews sync automatically from Google.
          </div>
        ) : (
          <div className="divide-y divide-warm-border/50">
            {reviewList.map((r) => (
              <div key={r.id} className="px-5 py-3.5 hover:bg-warm-light/50">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-ink">{r.reviewer_name || 'Anonymous'}</span>
                    <span className="text-xs text-amber-500">{'★'.repeat(r.rating || 0)}<span className="text-warm-border">{'★'.repeat(5 - (r.rating || 0))}</span></span>
                  </div>
                  <span className="text-[10px] text-warm-gray">
                    {r.published_at ? new Date(r.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                  </span>
                </div>
                {r.body && (
                  <p className="text-xs text-warm-gray line-clamp-2">{r.body}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Forms section */}
      <div className="border border-warm-border rounded-xl overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-warm-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Forms</h2>
          <div className="flex items-center gap-3">
            <Link
              href={`${basePath}/forms`}
              className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
            >
              View all
            </Link>
            <Link
              href={`${basePath}/forms/new`}
              className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
            >
              + New Form
            </Link>
          </div>
        </div>
        {formList.length === 0 ? (
          <div className="p-12 text-center text-warm-gray text-sm">
            No forms yet.{' '}
            <Link href={`${basePath}/forms/new`} className="text-ink underline hover:no-underline">
              Create one
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-warm-border">
                {['Form', 'URL', 'Status', ''].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {formList.map((f) => (
                <tr key={f.id} className="border-b border-warm-border/50 hover:bg-warm-light/50">
                  <td className="px-5 py-3.5">
                    <div className="text-sm font-medium text-ink">{f.name}</div>
                  </td>
                  <td className="px-5 py-3.5">
                    <code className="text-xs text-ink font-mono">/f/{f.slug}</code>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${
                      f.active ? 'text-emerald-600' : 'text-warm-gray'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        f.active ? 'bg-emerald-500' : 'bg-warm-border'
                      }`} />
                      {f.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <Link
                      href={`${basePath}/forms/${f.id}`}
                      className="text-xs text-warm-gray hover:text-ink no-underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Review Funnels section */}
      <div className="border border-warm-border rounded-xl overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-warm-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Review Funnels</h2>
          <Link
            href={`${basePath}/review-funnels/new`}
            className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
          >
            + New Funnel
          </Link>
        </div>
        {profiles.length === 0 ? (
          <div className="p-12 text-center text-warm-gray text-sm">
            No review funnels yet.{' '}
            <Link href={`${basePath}/review-funnels/new`} className="text-ink underline hover:no-underline">
              Create one
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-warm-border">
                {['Profile', 'URL', 'Views (7d)', 'Google (7d)', 'Emails (7d)', 'Avg Rating', ''].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.profile_id} className="border-b border-warm-border/50 hover:bg-warm-light/50">
                  <td className="px-5 py-3.5">
                    <div className="text-sm font-medium text-ink">{p.profile_name}</div>
                  </td>
                  <td className="px-5 py-3.5">
                    <code className="text-xs text-ink font-mono">/r/{p.slug}</code>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-sm text-ink">{p.views_7d}</td>
                  <td className="px-5 py-3.5 font-mono text-sm text-ink">{p.google_clicks_7d}</td>
                  <td className="px-5 py-3.5 font-mono text-sm text-ink">{p.email_clicks_7d}</td>
                  <td className="px-5 py-3.5 font-mono text-sm text-ink">
                    {p.avg_rating ? `${p.avg_rating}★` : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <Link
                      href={`${basePath}/review-funnels/${p.profile_id}`}
                      className="text-xs text-warm-gray hover:text-ink no-underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Audit Trail - Agency Admin Only */}
      {isAgencyAdmin && (
        <AuditTrail resourceType="location" resourceId={location.id} />
      )}
    </div>
  )
}
