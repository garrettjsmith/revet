import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agency/feed
 *
 * Returns grouped work items for the agency feed.
 * Same underlying data as /api/agency/work-queue, but items are grouped
 * by org + type + batch into cards for bulk action.
 *
 * Query params:
 *   filter: 'all' | 'reviews' | 'posts' | 'profiles' | 'errors' | 'landers'
 *   scope: 'all' | 'mine'
 *   org_id: optional org filter
 *   location_id: optional location filter
 *   offset: group pagination offset (default: 0)
 *   limit: groups per page (default: 20, max: 50)
 */
export async function GET(request: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminClient = createAdminClient()

  // Check agency admin status
  const { data: adminCheck } = await supabase
    .from('org_members')
    .select('is_agency_admin')
    .eq('user_id', user.id)
    .eq('is_agency_admin', true)
    .limit(1)

  const isAgencyAdmin = adminCheck && adminCheck.length > 0

  // Check account manager assignments
  const { data: managerAssignments } = await adminClient
    .from('org_account_managers')
    .select('org_id')
    .eq('user_id', user.id)

  const managedOrgIds = (managerAssignments || []).map((a: { org_id: string }) => a.org_id)
  const isAccountManager = managedOrgIds.length > 0

  if (!isAgencyAdmin && !isAccountManager) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const filter = searchParams.get('filter') || 'all'
  const scope = searchParams.get('scope') || 'all'
  const orgIdFilter = searchParams.get('org_id') || null
  const locationIdFilter = searchParams.get('location_id') || null
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10))
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50)

  // Determine scoped location IDs
  let scopedLocationIds: string[] | null = null

  if (!isAgencyAdmin || scope === 'mine') {
    if (managedOrgIds.length === 0) {
      return NextResponse.json(emptyResponse(scope, isAgencyAdmin))
    }

    const { data: locations } = await adminClient
      .from('locations')
      .select('id')
      .in('org_id', managedOrgIds)
      .eq('active', true)

    scopedLocationIds = (locations || []).map((l: { id: string }) => l.id)
    if (scopedLocationIds.length === 0) {
      return NextResponse.json(emptyResponse(scope, isAgencyAdmin))
    }
  }

  // Apply org/location filters on top of scope
  if (locationIdFilter) {
    // Location filter is most specific — override scope
    scopedLocationIds = [locationIdFilter]
  } else if (orgIdFilter) {
    const { data: orgLocations } = await adminClient
      .from('locations')
      .select('id')
      .eq('org_id', orgIdFilter)
      .eq('active', true)

    const orgLocationIds = (orgLocations || []).map((l: { id: string }) => l.id)
    if (scopedLocationIds !== null) {
      // Intersect with scope
      scopedLocationIds = scopedLocationIds.filter((id: string) => orgLocationIds.includes(id))
    } else {
      scopedLocationIds = orgLocationIds
    }

    if (scopedLocationIds.length === 0) {
      return NextResponse.json(emptyResponse(scope, isAgencyAdmin))
    }
  }

  // Determine which queries to run based on filter
  const wantsReviews = filter === 'all' || filter === 'reviews'
  const wantsPosts = filter === 'all' || filter === 'posts'
  const wantsProfiles = filter === 'all' || filter === 'profiles'
  const wantsErrors = filter === 'all' || filter === 'errors'
  const wantsLanders = filter === 'all' || filter === 'landers'

  const reviewSelect = 'id, location_id, platform, reviewer_name, reviewer_photo_url, rating, body, published_at, sentiment, ai_draft, ai_draft_generated_at, status, assigned_to, locations(name, org_id, organizations(name, slug))'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyScope(query: any) {
    if (scopedLocationIds) {
      return query.in('location_id', scopedLocationIds)
    }
    return query
  }

  // Run all queries in parallel (same as work-queue)
  const [
    negativeResult,
    aiDraftResult,
    googleUpdateResult,
    pendingPostResult,
    reviewSyncErrorResult,
    profileSyncErrorResult,
    profileOptResult,
    staleLanderResult,
  ] = await Promise.all([
    wantsReviews
      ? applyScope(
          adminClient
            .from('reviews')
            .select(reviewSelect)
            .eq('platform', 'google')
            .eq('status', 'new')
            .is('reply_body', null)
        )
          .order('published_at', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as any[] }),
    wantsReviews
      ? applyScope(
          adminClient
            .from('reviews')
            .select(reviewSelect)
            .not('ai_draft', 'is', null)
            .is('reply_body', null)
            .neq('status', 'archived')
        )
          .order('ai_draft_generated_at', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as any[] }),
    wantsProfiles
      ? applyScope(
          adminClient
            .from('gbp_profiles')
            .select('location_id, business_name, has_google_updated, updated_at, locations(name, org_id, organizations(name, slug))')
            .eq('has_google_updated', true)
        )
          .limit(200)
      : Promise.resolve({ data: [] as any[] }),
    wantsPosts
      ? applyScope(
          adminClient
            .from('gbp_post_queue')
            .select('id, location_id, topic_type, summary, media_url, scheduled_for, status, assigned_to, source, topic_id, created_at, locations(name, org_id, organizations(name, slug))')
            .in('status', ['draft', 'client_review', 'pending'])
        )
          .order('created_at', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as any[] }),
    wantsErrors
      ? applyScope(
          adminClient
            .from('review_sources')
            .select('id, location_id, platform, sync_status, last_synced_at, metadata, locations(name, org_id, organizations(name, slug))')
            .eq('sync_status', 'error')
        )
          .limit(200)
      : Promise.resolve({ data: [] as any[] }),
    wantsErrors
      ? applyScope(
          adminClient
            .from('gbp_profiles')
            .select('location_id, sync_status, sync_error, last_synced_at, locations(name, org_id, organizations(name, slug))')
            .eq('sync_status', 'error')
        )
          .limit(200)
      : Promise.resolve({ data: [] as any[] }),
    wantsProfiles
      ? adminClient
          .from('profile_recommendations')
          .select('id, location_id, batch_id, field, current_value, proposed_value, ai_rationale, status, requires_client_approval, edited_value, created_at, locations:location_id(name, org_id, organizations(name, slug))')
          .in('status', ['pending', 'client_review'])
          .order('created_at', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as any[] }),
    wantsLanders
      ? applyScope(
          adminClient
            .from('local_landers')
            .select('id, location_id, slug, ai_content_stale, updated_at, locations(name, org_id, organizations(name, slug))')
            .eq('active', true)
            .eq('ai_content_stale', true)
        )
          .order('updated_at', { ascending: true })
          .limit(200)
      : Promise.resolve({ data: [] as any[] }),
  ])

  // Build flat item list (same dedup logic as work-queue)
  const seen = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = []

  for (const review of negativeResult.data || []) {
    if (seen.has(review.id)) continue
    seen.add(review.id)
    const priority = review.sentiment === 'negative' ? 'urgent' : 'important'
    items.push(formatReviewItem(review, 'review_reply', priority))
  }

  for (const profile of googleUpdateResult.data || []) {
    const key = `google_${profile.location_id}`
    if (seen.has(key)) continue
    seen.add(key)
    items.push(formatGoogleUpdateItem(profile))
  }

  for (const review of aiDraftResult.data || []) {
    if (seen.has(review.id)) continue
    seen.add(review.id)
    items.push(formatReviewItem(review, 'ai_draft_review', 'important'))
  }

  const syncErrorLocations = new Set<string>()
  for (const source of reviewSyncErrorResult.data || []) {
    if (syncErrorLocations.has(source.location_id)) continue
    syncErrorLocations.add(source.location_id)
    items.push(formatSyncErrorItem(source, 'review_source'))
  }
  for (const profile of profileSyncErrorResult.data || []) {
    if (syncErrorLocations.has(profile.location_id)) continue
    syncErrorLocations.add(profile.location_id)
    items.push(formatSyncErrorItem(profile, 'gbp_profile'))
  }

  for (const post of pendingPostResult.data || []) {
    items.push(formatPostItem(post))
  }

  const profileOptLocations = new Set<string>()
  for (const rec of profileOptResult.data || []) {
    if (scopedLocationIds && !scopedLocationIds.includes(rec.location_id)) continue
    if (profileOptLocations.has(rec.location_id)) continue
    profileOptLocations.add(rec.location_id)
    const locationRecs = (profileOptResult.data || []).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => r.location_id === rec.location_id
    )
    items.push(formatProfileOptItem(rec, locationRecs))
  }

  for (const lander of staleLanderResult.data || []) {
    const key = `stale_lander_${lander.id}`
    if (seen.has(key)) continue
    seen.add(key)
    items.push(formatStaleLanderItem(lander))
  }

  // Count by filter category (before grouping)
  const counts = {
    total: items.length,
    reviews: items.filter((i) => i.type === 'review_reply' || i.type === 'ai_draft_review').length,
    posts: items.filter((i) => i.type === 'post_pending').length,
    profiles: items.filter((i) => i.type === 'profile_optimization' || i.type === 'google_update').length,
    errors: items.filter((i) => i.type === 'sync_error').length,
    landers: items.filter((i) => i.type === 'stale_lander').length,
  }

  // Group items by org + type + batch
  const groupMap = new Map<string, {
    group_key: string
    org_id: string
    org_name: string
    org_slug: string
    item_type: string
    priority: 'urgent' | 'important' | 'info'
    items: any[]
    created_at: string
  }>()

  for (const item of items) {
    const batchKey = getBatchKey(item)
    const groupKey = `${item.org_id || ''}:${item.type}:${batchKey}`

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        group_key: groupKey,
        org_id: item.org_id || '',
        org_name: item.org_name,
        org_slug: item.org_slug,
        item_type: item.type,
        priority: item.priority,
        items: [],
        created_at: item.created_at,
      })
    }

    const group = groupMap.get(groupKey)!
    group.items.push(item)

    // Escalate group priority to highest item priority
    if (item.priority === 'urgent') group.priority = 'urgent'
    else if (item.priority === 'important' && group.priority !== 'urgent') group.priority = 'important'

    // Track most recent created_at
    if (item.created_at > group.created_at) {
      group.created_at = item.created_at
    }
  }

  // Sort groups: urgent first, then important, then info, then by recency
  const priorityOrder = { urgent: 0, important: 1, info: 2 }
  const groups = Array.from(groupMap.values())
    .map((g) => ({
      ...g,
      item_count: g.items.length,
    }))
    .sort((a, b) => {
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
      if (pDiff !== 0) return pDiff
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  // Sort items within each group
  for (const group of groups) {
    sortGroupItems(group.items, group.item_type)
  }

  // Paginate groups
  const totalGroups = groups.length
  const page = groups.slice(offset, offset + limit)

  // Find latest created_at across all items (for new-items polling)
  const latestCreatedAt = items.length > 0
    ? items.reduce((latest, item) => item.created_at > latest ? item.created_at : latest, items[0].created_at)
    : new Date().toISOString()

  return NextResponse.json({
    groups: page,
    counts,
    total_groups: totalGroups,
    offset,
    has_more: offset + limit < totalGroups,
    scope: scopedLocationIds ? 'mine' : 'all',
    is_agency_admin: isAgencyAdmin,
    latest_created_at: latestCreatedAt,
  })
}

// ─── Grouping helpers ──────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getBatchKey(item: any): string {
  switch (item.type) {
    case 'ai_draft_review':
      return 'ai_draft'
    case 'review_reply':
      return 'needs_reply'
    case 'post_pending':
      return item.post?.status || 'draft'
    case 'profile_optimization':
      return 'pending'
    case 'google_update':
      return 'google_update'
    case 'sync_error':
      return 'sync_error'
    case 'stale_lander':
      return 'stale_lander'
    default:
      return 'other'
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sortGroupItems(items: any[], itemType: string) {
  switch (itemType) {
    case 'review_reply':
    case 'ai_draft_review':
      // Negative reviews first, then by date
      items.sort((a, b) => {
        const aNeg = a.review?.sentiment === 'negative' ? 0 : 1
        const bNeg = b.review?.sentiment === 'negative' ? 0 : 1
        if (aNeg !== bNeg) return aNeg - bNeg
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
      break
    case 'post_pending':
      // Soonest scheduled first
      items.sort((a, b) => {
        const aDate = a.post?.scheduled_for || '9999'
        const bDate = b.post?.scheduled_for || '9999'
        return aDate.localeCompare(bDate)
      })
      break
    default:
      // Newest first
      items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function emptyResponse(scope: string, isAgencyAdmin: any) {
  return {
    groups: [],
    counts: { total: 0, reviews: 0, posts: 0, profiles: 0, errors: 0, landers: 0 },
    total_groups: 0,
    offset: 0,
    has_more: false,
    scope: scope === 'mine' ? 'mine' : 'all',
    is_agency_admin: !!isAgencyAdmin,
    latest_created_at: new Date().toISOString(),
  }
}

// ─── Item formatters (same as work-queue) ──────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatReviewItem(review: any, type: 'review_reply' | 'ai_draft_review', priority: 'urgent' | 'important') {
  const loc = review.locations
  const org = loc?.organizations

  return {
    id: review.id,
    type,
    priority,
    created_at: review.published_at,
    assigned_to: review.assigned_to,
    location_id: review.location_id,
    location_name: loc?.name || 'Unknown',
    org_id: org?.id || loc?.org_id || '',
    org_name: org?.name || 'Unknown',
    org_slug: org?.slug || '',
    review: {
      id: review.id,
      reviewer_name: review.reviewer_name,
      reviewer_photo_url: review.reviewer_photo_url,
      rating: review.rating,
      body: review.body,
      platform: review.platform,
      published_at: review.published_at,
      sentiment: review.sentiment,
      ai_draft: review.ai_draft,
      ai_draft_generated_at: review.ai_draft_generated_at,
      status: review.status,
    },
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatGoogleUpdateItem(profile: any) {
  const loc = profile.locations
  const org = loc?.organizations

  return {
    id: `google_${profile.location_id}`,
    type: 'google_update' as const,
    priority: 'urgent' as const,
    created_at: profile.updated_at,
    assigned_to: null,
    location_id: profile.location_id,
    location_name: loc?.name || 'Unknown',
    org_id: org?.id || loc?.org_id || '',
    org_name: org?.name || 'Unknown',
    org_slug: org?.slug || '',
    google_update: {
      location_id: profile.location_id,
      business_name: profile.business_name,
    },
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatPostItem(post: any) {
  const loc = post.locations
  const org = loc?.organizations
  const isDraft = post.status === 'draft'

  return {
    id: post.id,
    type: 'post_pending' as const,
    priority: isDraft ? 'important' as const : 'info' as const,
    created_at: post.created_at,
    assigned_to: post.assigned_to || null,
    location_id: post.location_id,
    location_name: loc?.name || 'Unknown',
    org_id: org?.id || loc?.org_id || '',
    org_name: org?.name || 'Unknown',
    org_slug: org?.slug || '',
    post: {
      id: post.id,
      topic_type: post.topic_type,
      summary: post.summary,
      media_url: post.media_url || null,
      scheduled_for: post.scheduled_for,
      status: post.status,
      source: post.source || 'manual',
    },
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatSyncErrorItem(source: any, sourceType: 'review_source' | 'gbp_profile') {
  const loc = source.locations
  const org = loc?.organizations

  return {
    id: `sync_${source.location_id}_${sourceType}`,
    type: 'sync_error' as const,
    priority: 'important' as const,
    created_at: source.last_synced_at || new Date().toISOString(),
    assigned_to: null,
    location_id: source.location_id,
    location_name: loc?.name || 'Unknown',
    org_id: org?.id || loc?.org_id || '',
    org_name: org?.name || 'Unknown',
    org_slug: org?.slug || '',
    sync_error: {
      source_type: sourceType,
      platform: source.platform || 'google',
      sync_error: source.sync_error || source.metadata?.last_error || null,
      last_synced_at: source.last_synced_at,
    },
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatStaleLanderItem(lander: any) {
  const loc = lander.locations
  const org = loc?.organizations

  return {
    id: `stale_lander_${lander.id}`,
    type: 'stale_lander' as const,
    priority: 'important' as const,
    created_at: lander.updated_at || new Date().toISOString(),
    assigned_to: null,
    location_id: lander.location_id,
    location_name: loc?.name || 'Unknown',
    org_id: org?.id || loc?.org_id || '',
    org_name: org?.name || 'Unknown',
    org_slug: org?.slug || '',
    stale_lander: {
      lander_id: lander.id,
      slug: lander.slug,
    },
  }
}

// Keep only the most recent rec per field (dedupes across batches)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dedupeRecsByField(recs: any[]) {
  const byField = new Map<string, any>()
  for (const r of recs) {
    const existing = byField.get(r.field)
    if (!existing || r.created_at > existing.created_at) {
      byField.set(r.field, r)
    }
  }
  return Array.from(byField.values()).map((r) => ({
    id: r.id,
    field: r.field,
    current_value: r.current_value,
    proposed_value: r.proposed_value,
    ai_rationale: r.ai_rationale,
    status: r.status,
    requires_client_approval: r.requires_client_approval,
    edited_value: r.edited_value,
  }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatProfileOptItem(firstRec: any, allRecs: any[]) {
  const loc = firstRec.locations
  const org = loc?.organizations

  return {
    id: `profile_opt_${firstRec.location_id}`,
    type: 'profile_optimization' as const,
    priority: 'important' as const,
    created_at: firstRec.created_at,
    assigned_to: null,
    location_id: firstRec.location_id,
    location_name: loc?.name || 'Unknown',
    org_id: org?.id || loc?.org_id || '',
    org_name: org?.name || 'Unknown',
    org_slug: org?.slug || '',
    profile_optimization: {
      batch_id: firstRec.batch_id,
      recommendations: dedupeRecsByField(allRecs),
    },
  }
}
