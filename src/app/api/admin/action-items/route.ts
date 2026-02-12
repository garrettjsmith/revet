import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId')
  if (!orgId) {
    return NextResponse.json({ error: 'orgId is required' }, { status: 400 })
  }

  // Auth: verify user has access to this org
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('org_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .limit(1)

  if (!membership || membership.length === 0) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminClient = createAdminClient()

  // Get location IDs for this org
  const { data: locations } = await adminClient
    .from('locations')
    .select('id')
    .eq('org_id', orgId)

  const locationIds = (locations || []).map((l: any) => l.id)

  if (locationIds.length === 0) {
    return NextResponse.json({
      items: [],
      summary: { total_locations: 0, total_reviews: 0, unread_total: 0 },
    })
  }

  // Run all queries in parallel
  const [
    { count: unreadNegativeCount },
    { count: unreadTotalCount },
    { count: googleUpdatesCount },
    { count: reviewSyncErrors },
    { count: profileSyncErrors },
    { count: pendingReplies },
    { count: totalReviews },
  ] = await Promise.all([
    adminClient
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .in('location_id', locationIds)
      .eq('status', 'new')
      .eq('sentiment', 'negative'),
    adminClient
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .in('location_id', locationIds)
      .eq('status', 'new'),
    adminClient
      .from('gbp_profiles')
      .select('*', { count: 'exact', head: true })
      .in('location_id', locationIds)
      .eq('has_google_updated', true),
    adminClient
      .from('review_sources')
      .select('*', { count: 'exact', head: true })
      .in('location_id', locationIds)
      .eq('sync_status', 'error'),
    adminClient
      .from('gbp_profiles')
      .select('*', { count: 'exact', head: true })
      .in('location_id', locationIds)
      .eq('sync_status', 'error'),
    adminClient
      .from('review_reply_queue')
      .select('*', { count: 'exact', head: true })
      .in('review_id', locationIds)
      .eq('status', 'pending'),
    adminClient
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .in('location_id', locationIds),
  ])

  const syncErrors = (reviewSyncErrors || 0) + (profileSyncErrors || 0)

  type ActionItem = {
    type: string
    priority: 'urgent' | 'important' | 'info'
    count: number
    label: string
    action_label: string
    action_path: string
  }

  const items: ActionItem[] = []

  // We need the org slug for links — fetch it
  const { data: org } = await adminClient
    .from('organizations')
    .select('slug')
    .eq('id', orgId)
    .single()

  const orgSlug = org?.slug || ''
  const basePath = `/admin/${orgSlug}`

  if ((unreadNegativeCount || 0) > 0) {
    items.push({
      type: 'negative_reviews',
      priority: 'urgent',
      count: unreadNegativeCount || 0,
      label: `${unreadNegativeCount} negative review${unreadNegativeCount === 1 ? '' : 's'} need${unreadNegativeCount === 1 ? 's' : ''} a reply`,
      action_label: 'View reviews',
      action_path: `${basePath}/reviews?filter=negative`,
    })
  }

  if ((googleUpdatesCount || 0) > 0) {
    items.push({
      type: 'google_updates',
      priority: 'urgent',
      count: googleUpdatesCount || 0,
      label: `${googleUpdatesCount} profile${googleUpdatesCount === 1 ? '' : 's'} ${googleUpdatesCount === 1 ? 'has' : 'have'} Google-suggested edits`,
      action_label: 'Review updates',
      action_path: `${basePath}/locations`,
    })
  }

  if (syncErrors > 0) {
    items.push({
      type: 'sync_errors',
      priority: 'important',
      count: syncErrors,
      label: `${syncErrors} sync error${syncErrors === 1 ? '' : 's'} need attention`,
      action_label: 'View errors',
      action_path: `${basePath}/locations`,
    })
  }

  if ((pendingReplies || 0) > 0) {
    items.push({
      type: 'pending_replies',
      priority: 'info',
      count: pendingReplies || 0,
      label: `${pendingReplies} repl${pendingReplies === 1 ? 'y' : 'ies'} queued to send`,
      action_label: 'View queue',
      action_path: `${basePath}/reviews`,
    })
  }

  return NextResponse.json({
    items,
    summary: {
      total_locations: locationIds.length,
      total_reviews: totalReviews || 0,
      unread_total: unreadTotalCount || 0,
    },
  })
}
