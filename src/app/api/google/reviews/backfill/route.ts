import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { fetchGoogleReviews, normalizeGoogleReview } from '@/lib/google/reviews'
import { getValidAccessToken, GoogleAuthError } from '@/lib/google/auth'

export const maxDuration = 300

/**
 * POST /api/google/reviews/backfill
 *
 * Full review backfill for newly mapped locations. Unlike the incremental cron sync
 * (which fetches only the latest page), this paginates through ALL reviews.
 *
 * Auth: API key via Authorization header OR authenticated agency admin session.
 *
 * Body: {
 *   source_ids?: string[]  // Specific review source IDs to backfill
 *   limit?: number         // Max sources to process (default 5)
 * }
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const apiKey = process.env.CRON_SECRET

  // Allow API key auth OR authenticated agency admin
  let authorized = false

  if (apiKey && authHeader === `Bearer ${apiKey}`) {
    authorized = true
  }

  if (!authorized) {
    // Check for agency admin session
    try {
      const supabase = createServerSupabase()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: membership } = await supabase
          .from('org_members')
          .select('is_agency_admin')
          .eq('user_id', user.id)
          .eq('is_agency_admin', true)
          .limit(1)
          .single()
        if (membership) authorized = true
      }
    } catch {
      // Auth check failed — fall through to unauthorized
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await getValidAccessToken()
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      return NextResponse.json({ error: 'Google connection required' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Google auth error' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const sourceIds: string[] | undefined = body.source_ids
  const limit = body.limit || 5

  const supabase = createAdminClient()

  // Get sources to backfill
  let query = supabase
    .from('review_sources')
    .select('*, locations(id, name, org_id)')
    .eq('platform', 'google')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (sourceIds && sourceIds.length > 0) {
    query = query.in('id', sourceIds)
  } else {
    // Default: backfill sources that are still pending (never synced)
    query = query.eq('sync_status', 'pending')
  }

  const { data: sources } = await query

  if (!sources || sources.length === 0) {
    return NextResponse.json({ ok: true, message: 'No sources to backfill', synced: 0 })
  }

  const results: Array<{ source_id: string; reviews_synced: number; total_pages: number; error?: string }> = []

  for (const source of sources) {
    try {
      // Get the GBP resource name
      let gbpLocationName = (source.metadata as any)?.gbp_location_name

      if (!gbpLocationName) {
        const { data: mapping } = await supabase
          .from('agency_integration_mappings')
          .select('external_resource_id')
          .eq('resource_type', 'gbp_location')
          .eq('location_id', source.location_id)
          .limit(1)
          .single()

        if (mapping) gbpLocationName = mapping.external_resource_id
      }

      if (!gbpLocationName) {
        await supabase
          .from('review_sources')
          .update({ sync_status: 'error', metadata: { ...source.metadata, error: 'No GBP location name found' } })
          .eq('id', source.id)
        results.push({ source_id: source.id, reviews_synced: 0, total_pages: 0, error: 'No GBP location name' })
        continue
      }

      // Paginate through ALL reviews
      let pageToken: string | undefined
      let totalSynced = 0
      let totalPages = 0
      let totalReviewCount = 0
      let averageRating: number | null = null

      do {
        const data = await fetchGoogleReviews(gbpLocationName, {
          pageSize: 50,
          pageToken,
        })

        // Capture stats from first page
        if (totalPages === 0) {
          totalReviewCount = data.totalReviewCount || 0
          averageRating = data.averageRating || null
        }

        totalPages++

        if (!data.reviews || data.reviews.length === 0) break

        const normalizedReviews = data.reviews.map(normalizeGoogleReview)

        // Upsert reviews directly (avoid self-calling HTTP pattern)
        for (const review of normalizedReviews) {
          const sentiment = review.rating != null
            ? review.rating >= 4 ? 'positive' : review.rating === 3 ? 'neutral' : 'negative'
            : null

          const { error: upsertError } = await supabase
            .from('reviews')
            .upsert(
              {
                source_id: source.id,
                location_id: source.location_id,
                platform: 'google',
                platform_review_id: review.platform_review_id,
                reviewer_name: review.reviewer_name,
                reviewer_photo_url: review.reviewer_photo_url,
                is_anonymous: review.is_anonymous,
                rating: review.rating,
                original_rating: review.original_rating,
                body: review.body,
                published_at: review.published_at,
                updated_at: review.updated_at,
                reply_body: review.reply_body,
                reply_published_at: review.reply_published_at,
                sentiment,
                platform_metadata: review.platform_metadata,
                fetched_at: new Date().toISOString(),
              },
              { onConflict: 'source_id,platform_review_id' }
            )

          if (!upsertError) totalSynced++
        }

        pageToken = data.nextPageToken
      } while (pageToken)

      // Update source stats
      await supabase
        .from('review_sources')
        .update({
          last_synced_at: new Date().toISOString(),
          sync_status: 'active',
          total_review_count: totalReviewCount || source.total_review_count,
          average_rating: averageRating || source.average_rating,
          metadata: { ...source.metadata, backfill_completed_at: new Date().toISOString() },
        })
        .eq('id', source.id)

      results.push({ source_id: source.id, reviews_synced: totalSynced, total_pages: totalPages })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[google/reviews/backfill] Error for source ${source.id}:`, errorMessage)

      await supabase
        .from('review_sources')
        .update({
          sync_status: 'error',
          metadata: { ...source.metadata, last_error: errorMessage, error_at: new Date().toISOString() },
        })
        .eq('id', source.id)

      results.push({ source_id: source.id, reviews_synced: 0, total_pages: 0, error: errorMessage })
    }
  }

  const totalSynced = results.reduce((sum, r) => sum + r.reviews_synced, 0)

  return NextResponse.json({
    ok: true,
    sources_processed: results.length,
    total_reviews_synced: totalSynced,
    results,
  })
}
