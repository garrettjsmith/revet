import { createServerSupabase } from '@/lib/supabase/server'
import { getOrgBySlug } from '@/lib/org'
import { getLocation, checkAgencyAdmin } from '@/lib/locations'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function LocationReviewFunnelsPage({
  params,
}: {
  params: { orgSlug: string; locationId: string }
}) {
  const org = await getOrgBySlug(params.orgSlug)
  const location = await getLocation(params.locationId, org.id)
  if (!location) notFound()

  const supabase = createServerSupabase()
  const basePath = `/admin/${params.orgSlug}/locations/${params.locationId}`
  const isAgencyAdmin = await checkAgencyAdmin()

  const { data: profiles } = await supabase
    .from('review_profiles')
    .select('*')
    .eq('location_id', location.id)
    .order('created_at', { ascending: false })

  const profile = profiles?.[0]

  // No funnel set up yet
  if (!profile) {
    return (
      <div>
        <Breadcrumbs orgSlug={params.orgSlug} locationId={params.locationId} locationName={location.name} />
        <h1 className="text-2xl font-serif text-ink mb-6">Review Funnel</h1>
        <div className="text-center py-16 text-warm-gray text-sm">
          No review funnel configured for this location.
          {isAgencyAdmin && (
            <div className="mt-4">
              <Link
                href={`${basePath}/review-funnels/new`}
                className="px-5 py-2 bg-ink hover:bg-ink/90 text-cream text-sm font-medium rounded-full no-underline transition-colors"
              >
                + Create Funnel
              </Link>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Fetch stats for last 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const sixtyDaysAgo = new Date()
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

  const { data: currentEvents } = await supabase
    .from('review_events')
    .select('event_type, rating, metadata, created_at')
    .eq('profile_id', profile.id)
    .gte('created_at', thirtyDaysAgo.toISOString())

  const { data: priorEvents } = await supabase
    .from('review_events')
    .select('event_type')
    .eq('profile_id', profile.id)
    .gte('created_at', sixtyDaysAgo.toISOString())
    .lt('created_at', thirtyDaysAgo.toISOString())

  // Fetch recent feedback (feedback_submitted events with metadata)
  const { data: recentFeedback } = await supabase
    .from('review_events')
    .select('rating, metadata, created_at')
    .eq('profile_id', profile.id)
    .eq('event_type', 'feedback_submitted')
    .order('created_at', { ascending: false })
    .limit(10)

  const events = currentEvents || []
  const prior = priorEvents || []

  const stats = {
    views: events.filter((e) => e.event_type === 'page_view').length,
    ratings: events.filter((e) => e.event_type === 'rating_submitted').length,
    googleClicks: events.filter((e) => e.event_type === 'google_click').length,
    feedbackSent: events.filter((e) => e.event_type === 'feedback_submitted').length,
  }

  const priorStats = {
    views: prior.filter((e) => e.event_type === 'page_view').length,
    ratings: prior.filter((e) => e.event_type === 'rating_submitted').length,
    googleClicks: prior.filter((e) => e.event_type === 'google_click').length,
    feedbackSent: prior.filter((e) => e.event_type === 'feedback_submitted').length,
  }

  const funnelUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://use.revet.app'}/r/${profile.slug}`

  return (
    <div>
      <Breadcrumbs orgSlug={params.orgSlug} locationId={params.locationId} locationName={location.name} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-serif text-ink">Review Funnel</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={profile.active ? 'text-xs text-ink font-medium' : 'text-xs text-warm-gray'}>
              {profile.active ? '● Active' : '○ Inactive'}
            </span>
            <span className="text-xs text-warm-gray">·</span>
            <span className="text-xs text-warm-gray">{profile.name}</span>
          </div>
        </div>
        {isAgencyAdmin && (
          <Link
            href={`${basePath}/review-funnels/${profile.id}`}
            className="px-5 py-2 border border-warm-border text-warm-gray hover:text-ink hover:border-ink text-sm rounded-full no-underline transition-colors"
          >
            Settings
          </Link>
        )}
      </div>

      {/* Funnel URL */}
      <div className="border border-warm-border rounded-xl p-4 mb-6">
        <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1.5">Funnel URL</div>
        <code className="text-sm text-ink font-mono break-all">{funnelUrl}</code>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Page Views" value={stats.views} prior={priorStats.views} />
        <StatCard label="Ratings" value={stats.ratings} prior={priorStats.ratings} />
        <StatCard label="Google Clicks" value={stats.googleClicks} prior={priorStats.googleClicks} />
        <StatCard label="Feedback" value={stats.feedbackSent} prior={priorStats.feedbackSent} />
      </div>

      {/* Recent feedback */}
      <div>
        <h2 className="text-sm font-medium text-ink mb-3">Recent Feedback</h2>
        {(recentFeedback && recentFeedback.length > 0) ? (
          <div className="space-y-3">
            {recentFeedback.map((fb, i) => (
              <div key={i} className="border border-warm-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span
                        key={star}
                        className="text-sm"
                        style={{ color: fb.rating && star <= fb.rating ? '#FBBF24' : '#D5CFC5' }}
                      >
                        ★
                      </span>
                    ))}
                  </div>
                  <span className="text-xs text-warm-gray">
                    {formatTimeAgo(fb.created_at)}
                  </span>
                </div>
                <p className="text-sm text-ink leading-relaxed">
                  {(fb.metadata as any)?.feedback || 'No feedback text'}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-warm-gray text-sm border border-warm-border rounded-xl">
            No feedback submitted yet.
          </div>
        )}
      </div>
    </div>
  )
}

function Breadcrumbs({ orgSlug, locationId, locationName }: { orgSlug: string; locationId: string; locationName: string }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <Link
        href={`/admin/${orgSlug}/locations`}
        className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
      >
        Locations
      </Link>
      <span className="text-xs text-warm-gray">/</span>
      <Link
        href={`/admin/${orgSlug}/locations/${locationId}`}
        className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
      >
        {locationName}
      </Link>
      <span className="text-xs text-warm-gray">/</span>
    </div>
  )
}

function StatCard({ label, value, prior }: { label: string; value: number; prior: number }) {
  const pctChange = prior > 0 ? Math.round(((value - prior) / prior) * 100) : null

  return (
    <div className="border border-warm-border rounded-xl p-4">
      <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-serif text-ink">{value}</div>
      {pctChange !== null && (
        <div className={`text-xs mt-1 ${pctChange >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {pctChange >= 0 ? '↑' : '↓'} {Math.abs(pctChange)}% vs prior 30d
        </div>
      )}
      {pctChange === null && prior === 0 && value > 0 && (
        <div className="text-xs mt-1 text-warm-gray">new</div>
      )}
    </div>
  )
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 30) return `${diffDays}d ago`
  return date.toLocaleDateString()
}
