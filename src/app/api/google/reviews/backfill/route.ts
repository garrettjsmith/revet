import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllGoogleReviews, normalizeGoogleReview } from '@/lib/google/reviews'
import { getValidAccessToken, GoogleAuthError } from '@/lib/google/auth'

export const maxDuration = 300 // 5 minutes — backfill can be slow for large accounts

/**
 * POST /api/google/reviews/backfill
 *
 * Fetches ALL historical reviews for Google review sources.
 * Unlike the cron sync (latest 50), this paginates through every review.
 *
 * Body (optional): {
 *   source_ids?: string[]   // Specific source IDs to backfill (defaults to all)
 *   limit?: number          // Max sources to process (default 5)
 * }
 *
 * Auth: REVIEW_SYNC_API_KEY bearer token or authenticated agency admin.
 */
export async function POST(request: NextRequest) {
  const supabase = createAdminClient()

  // Auth: API key or agency admin
  const authHeader = request.headers.get('authorization')
  const apiKey = process.env.REVIEW_SYNC_API_KEY

  if (apiKey && authHeader === `Bearer ${apiKey}`) {
    // API key auth — OK
  } else {
    // Check for agency admin session
    const { createServerSupabase } = await import('@/lib/supabase/server')
    const userSupabase = createServerSupabase()
    const { data: { user } } = await userSupabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: admin } = await supabase
      .from('org_members')
      .select('is_agency_admin')
      .eq('user_id', user.id)
      .eq('is_agency_admin', true)
      .limit(1)
      .single()

    if (!admin) {
      return NextResponse.json({ error: 'Agency admin access required' }, { status: 403 })
    }
  }

  try {
    await getValidAccessToken()
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      return NextResponse.json({ error: 'Google integration requires reconnection' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Google auth error' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const sourceIds: string[] | undefined = body.source_ids
  const limit = body.limit || 5

  // Get Google review sources
  let query = supabase
    .from('review_sources')
    .select('*, locations(id, name, org_id)')
    .eq('platform', 'google')
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(limit)

  if (sourceIds && sourceIds.length > 0) {
    query = query.in('id', sourceIds)
  }

  const { data: sources } = await query

  if (!sources || sources.length === 0) {
    return NextResponse.json({ ok: true, message: 'No Google review sources found', synced: 0 })
  }

  const results: Array<{ source_id: string; location_name: string; total_reviews: number; synced: number; error?: string }> = []

  for (const source of sources) {
    const locationName = (source.locations as any)?.name || source.id
    try {
      // Get GBP resource name
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
        results.push({ source_id: source.id, location_name: locationName, total_reviews: 0, synced: 0, error: 'No GBP location name found' })
        continue
      }

      // Fetch ALL reviews (paginates automatically)
      const allReviews = await fetchAllGoogleReviews(gbpLocationName)

      if (allReviews.length === 0) {
        await supabase
          .from('review_sources')
          .update({ last_synced_at: new Date().toISOString(), sync_status: 'active' })
          .eq('id', source.id)
        results.push({ source_id: source.id, location_name: locationName, total_reviews: 0, synced: 0 })
        continue
      }

      // Normalize all reviews
      const normalized = allReviews.map(normalizeGoogleReview)

      // Sync in batches of 50 through the internal sync endpoint
      const batchSize = 50
      let totalSynced = 0

      for (let i = 0; i < normalized.length; i += batchSize) {
        const batch = normalized.slice(i, i + batchSize)
        const syncUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/reviews/sync`
        const syncRes = await fetch(syncUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: apiKey ? `Bearer ${apiKey}` : '',
          },
          body: JSON.stringify({
            source_id: source.id,
            reviews: batch,
            trigger: 'backfill',
          }),
        })
        const syncResult = await syncRes.json()
        totalSynced += syncResult.processed || 0
      }

      // Update source stats
      await supabase
        .from('review_sources')
        .update({
          last_synced_at: new Date().toISOString(),
          sync_status: 'active',
          total_review_count: allReviews.length,
        })
        .eq('id', source.id)

      results.push({ source_id: source.id, location_name: locationName, total_reviews: allReviews.length, synced: totalSynced })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[google/reviews/backfill] Error for ${source.id}:`, errorMessage)
      results.push({ source_id: source.id, location_name: locationName, total_reviews: 0, synced: 0, error: errorMessage })
    }
  }

  const totalSynced = results.reduce((sum, r) => sum + r.synced, 0)
  const totalReviews = results.reduce((sum, r) => sum + r.total_reviews, 0)

  return NextResponse.json({
    ok: true,
    sources_processed: results.length,
    total_reviews_found: totalReviews,
    total_reviews_synced: totalSynced,
    results,
  })
}
