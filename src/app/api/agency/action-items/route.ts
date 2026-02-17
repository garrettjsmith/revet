import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Auth: verify agency admin
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: adminCheck } = await supabase
    .from('org_members')
    .select('is_agency_admin')
    .eq('user_id', user.id)
    .eq('is_agency_admin', true)
    .limit(1)

  if (!adminCheck || adminCheck.length === 0) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const adminClient = createAdminClient()

  // Run all queries in parallel — fetch actual locations for Google updates and sync errors
  const [
    { count: unreadNegativeCount },
    { count: unreadTotalCount },
    { data: googleUpdateProfiles },
    { data: reviewSyncErrorSources },
    { data: profileSyncErrorProfiles },
    { count: pendingReplies },
    { count: pendingPosts },
    { count: totalLocations },
    { count: totalReviews },
    { data: staleSources },
  ] = await Promise.all([
    adminClient
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'new')
      .eq('sentiment', 'negative'),
    adminClient
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'new'),
    // Google updates — fetch actual locations (up to 10)
    adminClient
      .from('gbp_profiles')
      .select('location_id, locations(name, org_id, organizations(name, slug))')
      .eq('has_google_updated', true)
      .limit(10),
    // Review source sync errors — fetch actual locations
    adminClient
      .from('review_sources')
      .select('location_id, platform, locations(name, org_id, organizations(name, slug))')
      .eq('sync_status', 'error')
      .limit(10),
    // GBP profile sync errors — fetch actual locations
    adminClient
      .from('gbp_profiles')
      .select('location_id, locations(name, org_id, organizations(name, slug))')
      .eq('sync_status', 'error')
      .limit(10),
    adminClient
      .from('review_reply_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    adminClient
      .from('gbp_post_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    adminClient
      .from('locations')
      .select('*', { count: 'exact', head: true }),
    adminClient
      .from('reviews')
      .select('*', { count: 'exact', head: true }),
    adminClient
      .from('review_sources')
      .select('location_id, locations(name, org_id, organizations(name, slug))')
      .eq('sync_status', 'active')
      .lt('last_synced_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(10),
  ])

  // Build location sub-items from fetched data
  function toLocationLinks(rows: any[] | null): Array<{ name: string; path: string }> {
    if (!rows) return []
    return rows.map((r: any) => {
      const loc = r.locations
      const org = loc?.organizations
      const orgSlug = org?.slug || ''
      return {
        name: loc?.name || 'Unknown',
        path: `/admin/${orgSlug}/locations/${r.location_id}`,
      }
    })
  }

  // Dedupe sync errors by location_id
  const allSyncErrors = [
    ...(reviewSyncErrorSources || []),
    ...(profileSyncErrorProfiles || []),
  ]
  const seenLocationIds = new Set<string>()
  const dedupedSyncErrors = allSyncErrors.filter((r: any) => {
    if (seenLocationIds.has(r.location_id)) return false
    seenLocationIds.add(r.location_id)
    return true
  })

  type SubItem = { name: string; path: string }
  type ActionItem = {
    type: string
    priority: 'urgent' | 'important' | 'info'
    count: number
    label: string
    action_label: string
    action_path: string
    locations?: SubItem[]
  }

  const items: ActionItem[] = []

  if ((unreadNegativeCount || 0) > 0) {
    items.push({
      type: 'negative_reviews',
      priority: 'urgent',
      count: unreadNegativeCount || 0,
      label: `${unreadNegativeCount} negative review${unreadNegativeCount === 1 ? '' : 's'} need${unreadNegativeCount === 1 ? 's' : ''} a reply`,
      action_label: 'View reviews',
      action_path: '/agency/queue',
    })
  }

  const googleUpdates = googleUpdateProfiles || []
  if (googleUpdates.length > 0) {
    const locationLinks = toLocationLinks(googleUpdates).map((l) => ({
      ...l,
      path: `${l.path}/gbp-profile`,
    }))
    items.push({
      type: 'google_updates',
      priority: 'urgent',
      count: googleUpdates.length,
      label: `${googleUpdates.length} profile${googleUpdates.length === 1 ? '' : 's'} ${googleUpdates.length === 1 ? 'has' : 'have'} Google-suggested edits`,
      action_label: 'Review updates',
      action_path: locationLinks[0]?.path || '/agency',
      locations: locationLinks,
    })
  }

  if (dedupedSyncErrors.length > 0) {
    const locationLinks = toLocationLinks(dedupedSyncErrors)
    items.push({
      type: 'sync_errors',
      priority: 'important',
      count: dedupedSyncErrors.length,
      label: `${dedupedSyncErrors.length} sync error${dedupedSyncErrors.length === 1 ? '' : 's'} need attention`,
      action_label: 'View errors',
      action_path: locationLinks[0]?.path || '/agency',
      locations: locationLinks,
    })
  }

  const staleList = staleSources || []
  if (staleList.length > 0) {
    const locationLinks = toLocationLinks(staleList)
    items.push({
      type: 'stale_syncs',
      priority: 'important',
      count: staleList.length,
      label: `${staleList.length} source${staleList.length === 1 ? '' : 's'} not synced in 24h`,
      action_label: 'View sources',
      action_path: locationLinks[0]?.path || '/agency',
      locations: locationLinks,
    })
  }

  if ((pendingReplies || 0) > 0) {
    items.push({
      type: 'pending_replies',
      priority: 'info',
      count: pendingReplies || 0,
      label: `${pendingReplies} repl${pendingReplies === 1 ? 'y' : 'ies'} queued to send`,
      action_label: 'View queue',
      action_path: '/agency/queue',
    })
  }

  if ((pendingPosts || 0) > 0) {
    items.push({
      type: 'pending_posts',
      priority: 'info',
      count: pendingPosts || 0,
      label: `${pendingPosts} post${pendingPosts === 1 ? '' : 's'} scheduled`,
      action_label: 'View posts',
      action_path: '/agency',
    })
  }

  return NextResponse.json({
    items,
    summary: {
      total_locations: totalLocations || 0,
      total_reviews: totalReviews || 0,
      unread_total: unreadTotalCount || 0,
    },
  })
}
