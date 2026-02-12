import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agency/work-queue
 *
 * Returns actionable work items for the agency work queue.
 * Items are computed from existing tables (no separate queue table).
 *
 * Access control:
 *   - Agency admins see all items (scope=all, default) or their managed orgs (scope=mine)
 *   - Account managers see only items from their assigned orgs
 *
 * Query params:
 *   filter: 'all' | 'needs_reply' | 'ai_drafts' | 'google_updates' | 'posts' | 'sync_errors'
 *   scope: 'all' | 'mine' (only affects agency admins; managers always scoped)
 *   limit: number (default: 50)
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

  const managedOrgIds = (managerAssignments || []).map((a) => a.org_id)
  const isAccountManager = managedOrgIds.length > 0

  // Must be either agency admin or account manager
  if (!isAgencyAdmin && !isAccountManager) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const filter = searchParams.get('filter') || 'all'
  const scope = searchParams.get('scope') || 'all'
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100)

  // Determine scoped location IDs
  // Agency admins see all by default, but can filter to "mine"
  // Account managers always see only their assigned orgs
  let scopedLocationIds: string[] | null = null // null = no filter (see all)

  if (!isAgencyAdmin || scope === 'mine') {
    if (managedOrgIds.length === 0) {
      return NextResponse.json({ items: [], counts: { total: 0, needs_reply: 0, ai_drafts: 0, google_updates: 0, posts: 0, sync_errors: 0 } })
    }

    const { data: locations } = await adminClient
      .from('locations')
      .select('id')
      .in('org_id', managedOrgIds)
      .eq('active', true)

    scopedLocationIds = (locations || []).map((l) => l.id)

    if (scopedLocationIds.length === 0) {
      return NextResponse.json({ items: [], counts: { total: 0, needs_reply: 0, ai_drafts: 0, google_updates: 0, posts: 0, sync_errors: 0 } })
    }
  }

  const reviewSelect = 'id, location_id, platform, reviewer_name, reviewer_photo_url, rating, body, published_at, sentiment, ai_draft, ai_draft_generated_at, status, assigned_to, locations(name, org_id, organizations(name, slug))'

  const wantsReviews = filter === 'all' || filter === 'needs_reply' || filter === 'ai_drafts'
  const wantsDrafts = filter === 'all' || filter === 'needs_reply' || filter === 'ai_drafts'
  const wantsGoogle = filter === 'all' || filter === 'google_updates'
  const wantsPosts = filter === 'all' || filter === 'posts'
  const wantsSyncErrors = filter === 'all' || filter === 'sync_errors'

  // Helper to apply location scope to a query builder
  function applyScope<T extends { in: (col: string, values: string[]) => T }>(query: T): T {
    if (scopedLocationIds) {
      return query.in('location_id', scopedLocationIds)
    }
    return query
  }

  // Run all queries in parallel
  const [
    negativeResult,
    aiDraftResult,
    googleUpdateResult,
    pendingPostResult,
    reviewSyncErrorResult,
    profileSyncErrorResult,
  ] = await Promise.all([
    // 1: Unreplied negative Google reviews (urgent)
    wantsReviews
      ? applyScope(
          adminClient
            .from('reviews')
            .select(reviewSelect)
            .eq('platform', 'google')
            .eq('status', 'new')
            .eq('sentiment', 'negative')
            .is('reply_body', null)
        )
          .order('published_at', { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] as any[] }),
    // 2: Reviews with AI drafts pending approval (important)
    wantsDrafts
      ? applyScope(
          adminClient
            .from('reviews')
            .select(reviewSelect)
            .not('ai_draft', 'is', null)
            .is('reply_body', null)
            .neq('status', 'archived')
        )
          .order('ai_draft_generated_at', { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] as any[] }),
    // 3: Google suggested updates (urgent)
    wantsGoogle
      ? applyScope(
          adminClient
            .from('gbp_profiles')
            .select('location_id, business_name, has_google_updated, updated_at, locations(name, org_id, organizations(name, slug))')
            .eq('has_google_updated', true)
        )
          .limit(limit)
      : Promise.resolve({ data: [] as any[] }),
    // 4: Pending posts in queue (info)
    wantsPosts
      ? applyScope(
          adminClient
            .from('gbp_post_queue')
            .select('id, location_id, topic_type, summary, scheduled_for, status, assigned_to, created_at, locations(name, org_id, organizations(name, slug))')
            .eq('status', 'pending')
        )
          .order('created_at', { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] as any[] }),
    // 5: Review source sync errors (important)
    wantsSyncErrors
      ? applyScope(
          adminClient
            .from('review_sources')
            .select('id, location_id, platform, sync_status, last_synced_at, metadata, locations(name, org_id, organizations(name, slug))')
            .eq('sync_status', 'error')
        )
          .limit(limit)
      : Promise.resolve({ data: [] as any[] }),
    // 6: GBP profile sync errors (important)
    wantsSyncErrors
      ? applyScope(
          adminClient
            .from('gbp_profiles')
            .select('location_id, sync_status, sync_error, last_synced_at, locations(name, org_id, organizations(name, slug))')
            .eq('sync_status', 'error')
        )
          .limit(limit)
      : Promise.resolve({ data: [] as any[] }),
  ])

  // Build unified item list
  const seen = new Set<string>()
  const items: any[] = []

  // Negative reviews (urgent)
  for (const review of negativeResult.data || []) {
    if (seen.has(review.id)) continue
    seen.add(review.id)
    items.push(formatReviewItem(review, 'review_reply', 'urgent'))
  }

  // Google updates (urgent)
  for (const profile of googleUpdateResult.data || []) {
    const key = `google_${profile.location_id}`
    if (seen.has(key)) continue
    seen.add(key)
    items.push(formatGoogleUpdateItem(profile))
  }

  // AI drafts (important) — skip if already included as negative
  for (const review of aiDraftResult.data || []) {
    if (seen.has(review.id)) continue
    seen.add(review.id)
    items.push(formatReviewItem(review, 'ai_draft_review', 'important'))
  }

  // Sync errors (important) — dedupe by location
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

  // Pending posts (info)
  for (const post of pendingPostResult.data || []) {
    items.push(formatPostItem(post))
  }

  // Count by type for filter badges
  const counts = {
    total: items.length,
    needs_reply: items.filter((i) => i.type === 'review_reply').length,
    ai_drafts: items.filter((i) => i.type === 'ai_draft_review').length,
    google_updates: items.filter((i) => i.type === 'google_update').length,
    posts: items.filter((i) => i.type === 'post_pending').length,
    sync_errors: items.filter((i) => i.type === 'sync_error').length,
  }

  return NextResponse.json({
    items: items.slice(0, limit),
    counts,
    scope: scopedLocationIds ? 'mine' : 'all',
    is_agency_admin: isAgencyAdmin,
  })
}

// ─── Formatters ─────────────────────────────────────────────

function formatReviewItem(
  review: any,
  type: 'review_reply' | 'ai_draft_review',
  priority: 'urgent' | 'important'
) {
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
    org_name: org?.name || 'Unknown',
    org_slug: org?.slug || '',
    google_update: {
      location_id: profile.location_id,
      business_name: profile.business_name,
    },
  }
}

function formatPostItem(post: any) {
  const loc = post.locations
  const org = loc?.organizations

  return {
    id: post.id,
    type: 'post_pending' as const,
    priority: 'info' as const,
    created_at: post.created_at,
    assigned_to: post.assigned_to || null,
    location_id: post.location_id,
    location_name: loc?.name || 'Unknown',
    org_name: org?.name || 'Unknown',
    org_slug: org?.slug || '',
    post: {
      id: post.id,
      topic_type: post.topic_type,
      summary: post.summary,
      scheduled_for: post.scheduled_for,
    },
  }
}

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
