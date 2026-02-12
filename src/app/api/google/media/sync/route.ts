import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listMedia } from '@/lib/google/profiles'
import { getValidAccessToken, GoogleAuthError } from '@/lib/google/auth'

export const maxDuration = 120

/**
 * POST /api/google/media/sync
 *
 * Syncs GBP media (photos) for mapped locations.
 * Fetches from Google and upserts into gbp_media table.
 *
 * Body (optional): {
 *   location_ids?: string[]
 *   limit?: number  (default 10)
 * }
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const apiKey = process.env.REVIEW_SYNC_API_KEY

  if (apiKey && authHeader === `Bearer ${apiKey}`) {
    // API key auth
  } else {
    const { createServerSupabase } = await import('@/lib/supabase/server')
    const supabase = createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminClient = createAdminClient()
    const { data: admin } = await adminClient
      .from('org_members')
      .select('is_agency_admin')
      .eq('user_id', user.id)
      .eq('is_agency_admin', true)
      .limit(1)
      .single()

    if (!admin) {
      return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
    }
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
  const locationIds: string[] | undefined = body.location_ids
  const limit = body.limit || 10

  const supabase = createAdminClient()

  // Get mapped locations with their GBP profile info for v4 API names
  let query = supabase
    .from('agency_integration_mappings')
    .select('external_resource_id, external_resource_name, location_id, metadata')
    .eq('resource_type', 'gbp_location')
    .not('location_id', 'is', null)
    .limit(limit)

  if (locationIds && locationIds.length > 0) {
    query = query.in('location_id', locationIds)
  }

  const { data: mappings } = await query

  if (!mappings || mappings.length === 0) {
    return NextResponse.json({ ok: true, message: 'No locations to sync', synced: 0 })
  }

  const results: Array<{ location_id: string; name: string; ok: boolean; media_count?: number; error?: string }> = []

  for (const mapping of mappings) {
    const locationName = mapping.external_resource_id
    const locationId = mapping.location_id!
    const displayName = mapping.external_resource_name || locationName

    try {
      // Get account name from gbp_profiles for v4 API
      const { data: profile } = await supabase
        .from('gbp_profiles')
        .select('gbp_account_name')
        .eq('location_id', locationId)
        .single()

      // Build account-scoped name for v4 API
      const accountLocationName = profile?.gbp_account_name
        ? `${profile.gbp_account_name}/${locationName}`
        : locationName

      const mediaItems = await listMedia(accountLocationName)

      // Upsert media items
      const googleNames: string[] = []
      for (const item of mediaItems) {
        googleNames.push(item.name)

        await supabase
          .from('gbp_media')
          .upsert(
            {
              location_id: locationId,
              gbp_media_name: item.name,
              media_format: item.mediaFormat || 'PHOTO',
              category: item.locationAssociation?.category || null,
              description: item.description || null,
              google_url: item.googleUrl || null,
              thumbnail_url: item.thumbnailUrl || null,
              width_px: item.dimensions?.widthPixels || null,
              height_px: item.dimensions?.heightPixels || null,
              create_time: item.createTime || null,
            },
            { onConflict: 'location_id,gbp_media_name' }
          )
      }

      // Delete stale rows no longer in Google
      if (googleNames.length > 0) {
        await supabase
          .from('gbp_media')
          .delete()
          .eq('location_id', locationId)
          .not('gbp_media_name', 'in', `(${googleNames.map((n) => `"${n}"`).join(',')})`)
      } else {
        // No media from Google — clear all local media
        await supabase
          .from('gbp_media')
          .delete()
          .eq('location_id', locationId)
      }

      results.push({ location_id: locationId, name: displayName, ok: true, media_count: mediaItems.length })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[media/sync] Error for ${locationId}:`, errorMessage)
      results.push({ location_id: locationId, name: displayName, ok: false, error: errorMessage })
    }
  }

  const synced = results.filter((r) => r.ok).length

  return NextResponse.json({
    ok: true,
    locations_processed: results.length,
    media_synced: synced,
    results,
  })
}

// Vercel cron sends GET
export const GET = POST
