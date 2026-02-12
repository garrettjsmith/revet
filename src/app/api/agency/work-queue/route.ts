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
 * MVP: review items only (unreplied Google reviews + AI drafts pending approval).
 *
 * Query params:
 *   filter: 'all' | 'needs_reply' | 'ai_drafts' (default: 'all')
 *   limit: number (default: 50)
 */
export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url)
  const filter = searchParams.get('filter') || 'all'
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100)

  const adminClient = createAdminClient()

  const reviewSelect = 'id, location_id, platform, reviewer_name, reviewer_photo_url, rating, body, published_at, sentiment, ai_draft, ai_draft_generated_at, status, assigned_to, locations(name, org_id, organizations(name, slug))'

  // Run queries in parallel
  const [negativeResult, aiDraftResult] = await Promise.all([
    // Query 1: Unreplied negative Google reviews (urgent)
    filter === 'all' || filter === 'needs_reply'
      ? adminClient
          .from('reviews')
          .select(reviewSelect)
          .eq('platform', 'google')
          .eq('status', 'new')
          .eq('sentiment', 'negative')
          .is('reply_body', null)
          .order('published_at', { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] as any[] }),
    // Query 2: Reviews with AI drafts pending approval (important)
    filter === 'all' || filter === 'ai_drafts'
      ? adminClient
          .from('reviews')
          .select(reviewSelect)
          .not('ai_draft', 'is', null)
          .is('reply_body', null)
          .neq('status', 'archived')
          .order('ai_draft_generated_at', { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const negativeReviews = negativeResult.data || []
  const aiDraftReviews = aiDraftResult.data || []

  // Dedupe: a negative review with an AI draft appears in both queries.
  // Merge into a single list with the higher priority type.
  const seen = new Set<string>()
  const items: any[] = []

  // Negative reviews first (urgent)
  for (const review of negativeReviews) {
    if (seen.has(review.id)) continue
    seen.add(review.id)
    items.push(formatWorkItem(review, 'review_reply', 'urgent'))
  }

  // AI drafts (important) — skip if already included as negative
  for (const review of aiDraftReviews) {
    if (seen.has(review.id)) continue
    seen.add(review.id)
    items.push(formatWorkItem(review, 'ai_draft_review', 'important'))
  }

  // Count by type for filter badges
  const counts = {
    total: items.length,
    needs_reply: items.filter((i) => i.type === 'review_reply').length,
    ai_drafts: items.filter((i) => i.type === 'ai_draft_review').length,
  }

  return NextResponse.json({ items: items.slice(0, limit), counts })
}

function formatWorkItem(
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
