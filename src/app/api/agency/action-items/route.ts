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

  // Run all queries in parallel
  const [
    { count: unreadNegativeCount },
    { count: unreadTotalCount },
    { count: googleUpdatesCount },
    { count: reviewSyncErrors },
    { count: profileSyncErrors },
    { count: pendingReplies },
    { count: pendingPosts },
    { count: totalLocations },
    { count: totalReviews },
    { data: staleSources },
  ] = await Promise.all([
    // Negative reviews without replies (status = 'new', sentiment = 'negative')
    adminClient
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'new')
      .eq('sentiment', 'negative'),
    // Total unread reviews
    adminClient
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'new'),
    // GBP profiles with Google updates
    adminClient
      .from('gbp_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('has_google_updated', true),
    // Review source sync errors
    adminClient
      .from('review_sources')
      .select('*', { count: 'exact', head: true })
      .eq('sync_status', 'error'),
    // GBP profile sync errors
    adminClient
      .from('gbp_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('sync_status', 'error'),
    // Pending reply queue items
    adminClient
      .from('review_reply_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    // Pending post queue items
    adminClient
      .from('gbp_post_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    // Total locations
    adminClient
      .from('locations')
      .select('*', { count: 'exact', head: true }),
    // Total reviews
    adminClient
      .from('reviews')
      .select('*', { count: 'exact', head: true }),
    // Stale review sources (active but last synced > 24h ago)
    adminClient
      .from('review_sources')
      .select('id')
      .eq('sync_status', 'active')
      .lt('last_synced_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ])

  const syncErrors = (reviewSyncErrors || 0) + (profileSyncErrors || 0)
  const staleCount = staleSources?.length || 0

  type ActionItem = {
    type: string
    priority: 'urgent' | 'important' | 'info'
    count: number
    label: string
    action_label: string
    action_path: string
  }

  const items: ActionItem[] = []

  if ((unreadNegativeCount || 0) > 0) {
    items.push({
      type: 'negative_reviews',
      priority: 'urgent',
      count: unreadNegativeCount || 0,
      label: `${unreadNegativeCount} negative review${unreadNegativeCount === 1 ? '' : 's'} need${unreadNegativeCount === 1 ? 's' : ''} a reply`,
      action_label: 'View reviews',
      action_path: '/agency/locations?filter=negative-reviews',
    })
  }

  if ((googleUpdatesCount || 0) > 0) {
    items.push({
      type: 'google_updates',
      priority: 'urgent',
      count: googleUpdatesCount || 0,
      label: `${googleUpdatesCount} profile${googleUpdatesCount === 1 ? '' : 's'} ${googleUpdatesCount === 1 ? 'has' : 'have'} Google-suggested edits`,
      action_label: 'Review updates',
      action_path: '/agency/locations?filter=google-updates',
    })
  }

  if (syncErrors > 0) {
    items.push({
      type: 'sync_errors',
      priority: 'important',
      count: syncErrors,
      label: `${syncErrors} sync error${syncErrors === 1 ? '' : 's'} need attention`,
      action_label: 'View errors',
      action_path: '/agency',
    })
  }

  if (staleCount > 0) {
    items.push({
      type: 'stale_syncs',
      priority: 'important',
      count: staleCount,
      label: `${staleCount} source${staleCount === 1 ? '' : 's'} not synced in 24h`,
      action_label: 'View sources',
      action_path: '/agency',
    })
  }

  if ((pendingReplies || 0) > 0) {
    items.push({
      type: 'pending_replies',
      priority: 'info',
      count: pendingReplies || 0,
      label: `${pendingReplies} repl${pendingReplies === 1 ? 'y' : 'ies'} queued to send`,
      action_label: 'View queue',
      action_path: '/agency',
    })
  }

  if ((pendingPosts || 0) > 0) {
    items.push({
      type: 'pending_posts',
      priority: 'info',
      count: pendingPosts || 0,
      label: `${pendingPosts} post${pendingPosts === 1 ? '' : 's'} scheduled`,
      action_label: 'View queue',
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
