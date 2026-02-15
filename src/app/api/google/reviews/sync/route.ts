import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchGoogleReviews, normalizeGoogleReview } from '@/lib/google/reviews'
import { fetchGBPProfile, normalizeGBPProfile } from '@/lib/google/profiles'
import { getValidAccessToken, GoogleAuthError } from '@/lib/google/auth'

export const maxDuration = 120

/**
 * POST /api/google/reviews/sync
 *
 * Cron-triggered endpoint that syncs Google reviews for all active review sources.
 * Processes up to 20 locations per run (sorted by last_synced_at ASC for fairness).
 * Also retries errored sources (they get a second chance each cycle).
 *
 * Auth: REVIEW_SYNC_API_KEY bearer token (same as the generic sync endpoint).
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const apiKey = process.env.REVIEW_SYNC_API_KEY

  if (apiKey && authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify Google integration is connected
  try {
    await getValidAccessToken()
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      return NextResponse.json(
        { error: 'Google integration requires reconnection' },
        { status: 401 }
      )
    }
    return NextResponse.json(
      { error: 'Google auth error' },
      { status: 500 }
    )
  }

  const supabase = createAdminClient()

  // Get Google review sources to sync (oldest first, limit 20)
  const { data: sources } = await supabase
    .from('review_sources')
    .select('*, locations(id, name, org_id)')
    .eq('platform', 'google')
    .in('sync_status', ['pending', 'active', 'error'])
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(20)

  if (!sources || sources.length === 0) {
    return NextResponse.json({ ok: true, message: 'No sources to sync', synced: 0 })
  }

  const results: Array<{ source_id: string; reviews_synced: number; error?: string }> = []

  for (const source of sources) {
    try {
      // Get the GBP resource name from metadata or mapping
      let gbpLocationName = (source.metadata as any)?.gbp_location_name

      if (!gbpLocationName) {
        // Try to find from integration mappings
        const { data: mapping } = await supabase
          .from('agency_integration_mappings')
          .select('external_resource_id, metadata')
          .eq('resource_type', 'gbp_location')
          .eq('location_id', source.location_id)
          .limit(1)
          .single()

        if (mapping) {
          gbpLocationName = mapping.external_resource_id
        }
      }

      if (!gbpLocationName) {
        await supabase
          .from('review_sources')
          .update({ sync_status: 'error', metadata: { ...source.metadata, error: 'No GBP location name found' } })
          .eq('id', source.id)
        results.push({ source_id: source.id, reviews_synced: 0, error: 'No GBP location name' })
        continue
      }

      // Fetch reviews from Google (latest page only for incremental sync)
      const data = await fetchGoogleReviews(gbpLocationName, {
        pageSize: 50,
        orderBy: 'updateTime desc',
      })

      if (!data.reviews || data.reviews.length === 0) {
        await supabase
          .from('review_sources')
          .update({
            last_synced_at: new Date().toISOString(),
            sync_status: 'active',
            total_review_count: data.totalReviewCount || source.total_review_count,
            average_rating: data.averageRating || source.average_rating,
          })
          .eq('id', source.id)

        results.push({ source_id: source.id, reviews_synced: 0 })
        continue
      }

      // Normalize and sync reviews through the existing sync endpoint
      const normalizedReviews = data.reviews.map(normalizeGoogleReview)

      // Call the internal sync endpoint
      const syncUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/reviews/sync`
      const syncResponse = await fetch(syncUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: apiKey ? `Bearer ${apiKey}` : '',
        },
        body: JSON.stringify({
          source_id: source.id,
          reviews: normalizedReviews,
          trigger: 'cron',
        }),
      })

      const syncResult = await syncResponse.json()

      if (!syncResponse.ok) {
        console.error(`[google/reviews/sync] Internal sync failed for source ${source.id}:`, syncResult)
      }

      // Update source stats and sync status from Google's response
      await supabase
        .from('review_sources')
        .update({
          total_review_count: data.totalReviewCount || source.total_review_count,
          average_rating: data.averageRating || source.average_rating,
          sync_status: 'active',
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', source.id)

      results.push({
        source_id: source.id,
        reviews_synced: syncResult.processed || 0,
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[google/reviews/sync] Error syncing source ${source.id}:`, errorMessage)

      await supabase
        .from('review_sources')
        .update({
          sync_status: 'error',
          metadata: { ...source.metadata, last_error: errorMessage, error_at: new Date().toISOString() },
        })
        .eq('id', source.id)

      results.push({ source_id: source.id, reviews_synced: 0, error: errorMessage })
    }
  }

  const totalSynced = results.reduce((sum, r) => sum + r.reviews_synced, 0)

  // Backfill missing GBP profiles for synced locations
  let profilesBackfilled = 0
  const syncedLocationIds = sources.map((s) => s.location_id)
  if (syncedLocationIds.length > 0) {
    const { data: existingProfiles } = await supabase
      .from('gbp_profiles')
      .select('location_id')
      .in('location_id', syncedLocationIds)

    const hasProfile = new Set((existingProfiles || []).map((p) => p.location_id))
    const missing = sources.filter((s) => !hasProfile.has(s.location_id))

    for (const source of missing) {
      const gbpLocationName = (source.metadata as any)?.gbp_location_name
      if (!gbpLocationName) continue

      try {
        const raw = await fetchGBPProfile(gbpLocationName)
        const normalized = normalizeGBPProfile(raw)

        await supabase
          .from('gbp_profiles')
          .upsert(
            {
              location_id: source.location_id,
              gbp_location_name: gbpLocationName,
              ...normalized,
              sync_status: 'active',
              last_synced_at: new Date().toISOString(),
              sync_error: null,
            },
            { onConflict: 'location_id' }
          )
        profilesBackfilled++
      } catch (err) {
        console.error(`[google/reviews/sync] Profile backfill failed for ${source.location_id}:`, err instanceof Error ? err.message : err)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    sources_processed: results.length,
    total_reviews_synced: totalSynced,
    profiles_backfilled: profilesBackfilled,
    results,
  })
}

// Vercel cron sends GET — delegate to the same handler
export const GET = POST
