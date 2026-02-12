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

  // Get org slug + location IDs in parallel
  const [{ data: org }, { data: locations }] = await Promise.all([
    adminClient.from('organizations').select('slug').eq('id', orgId).single(),
    adminClient.from('locations').select('id, name').eq('org_id', orgId),
  ])

  const orgSlug = org?.slug || ''
  const basePath = `/admin/${orgSlug}`
  const locationIds = (locations || []).map((l: any) => l.id)

  if (locationIds.length === 0) {
    return NextResponse.json({
      items: [],
      summary: { total_locations: 0, total_reviews: 0, unread_total: 0 },
    })
  }

  // Run all queries in parallel — fetch actual locations for Google updates and sync errors
  const [
    { count: unreadNegativeCount },
    { count: unreadTotalCount },
    { data: googleUpdateProfiles },
    { data: reviewSyncErrorSources },
    { data: profileSyncErrorProfiles },
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
    // Google updates — fetch actual locations
    adminClient
      .from('gbp_profiles')
      .select('location_id, locations(name)')
      .in('location_id', locationIds)
      .eq('has_google_updated', true)
      .limit(10),
    // Review source sync errors
    adminClient
      .from('review_sources')
      .select('location_id, locations(name)')
      .in('location_id', locationIds)
      .eq('sync_status', 'error')
      .limit(10),
    // GBP profile sync errors
    adminClient
      .from('gbp_profiles')
      .select('location_id, locations(name)')
      .in('location_id', locationIds)
      .eq('sync_status', 'error')
      .limit(10),
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

  function toLocationLinks(rows: any[] | null): Array<{ name: string; path: string }> {
    if (!rows) return []
    return rows.map((r: any) => ({
      name: r.locations?.name || 'Unknown',
      path: `${basePath}/locations/${r.location_id}`,
    }))
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
      action_path: `${basePath}/reviews?status=new&rating=2`,
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
      action_path: locationLinks[0]?.path || basePath,
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
      action_path: locationLinks[0]?.path || basePath,
      locations: locationLinks,
    })
  }

  if ((pendingReplies || 0) > 0) {
    items.push({
      type: 'pending_replies',
      priority: 'info',
      count: pendingReplies || 0,
      label: `${pendingReplies} repl${pendingReplies === 1 ? 'y' : 'ies'} queued to send`,
      action_label: 'View reviews',
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
