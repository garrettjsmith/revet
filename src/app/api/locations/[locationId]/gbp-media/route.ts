import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAgencyAdmin } from '@/lib/locations'
import { createMediaFromUrl, deleteMedia } from '@/lib/google/profiles'
import { getValidAccessToken, GoogleAuthError } from '@/lib/google/auth'

const VALID_CATEGORIES = [
  'COVER', 'PROFILE', 'LOGO', 'EXTERIOR', 'INTERIOR', 'PRODUCT',
  'AT_WORK', 'FOOD_AND_DRINK', 'MENU', 'COMMON_AREA', 'ROOMS',
  'TEAMS', 'ADDITIONAL',
]

/**
 * POST /api/locations/[locationId]/gbp-media
 *
 * Upload a photo from URL to Google Business Profile.
 * Agency admin only.
 *
 * Body: { source_url: string, category: string, description?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  try {
    await getValidAccessToken()
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      return NextResponse.json({ error: 'Google connection required' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Google auth error' }, { status: 500 })
  }

  const body = await request.json()
  const { source_url, category, description } = body

  if (!source_url) {
    return NextResponse.json({ error: 'source_url required' }, { status: 400 })
  }

  if (!category || !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` }, { status: 400 })
  }

  const adminClient = createAdminClient()

  const { data: profile } = await adminClient
    .from('gbp_profiles')
    .select('gbp_location_name, gbp_account_name')
    .eq('location_id', params.locationId)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'No GBP profile found' }, { status: 404 })
  }

  const accountLocationName = profile.gbp_account_name
    ? `${profile.gbp_account_name}/${profile.gbp_location_name}`
    : profile.gbp_location_name

  try {
    const item = await createMediaFromUrl(accountLocationName, source_url, category, description)

    // Insert into local DB
    const { data: media, error: insertError } = await adminClient
      .from('gbp_media')
      .insert({
        location_id: params.locationId,
        gbp_media_name: item.name,
        media_format: item.mediaFormat || 'PHOTO',
        category: item.locationAssociation?.category || category,
        description: item.description || description || null,
        google_url: item.googleUrl || null,
        thumbnail_url: item.thumbnailUrl || null,
        width_px: item.dimensions?.widthPixels || null,
        height_px: item.dimensions?.heightPixels || null,
        create_time: item.createTime || new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      console.error('[gbp-media] Insert error:', insertError)
    }

    return NextResponse.json({ ok: true, media })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[gbp-media] Upload failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/locations/[locationId]/gbp-media
 *
 * Delete a photo from Google Business Profile.
 * Agency admin only.
 *
 * Body: { media_id: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  try {
    await getValidAccessToken()
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      return NextResponse.json({ error: 'Google connection required' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Google auth error' }, { status: 500 })
  }

  const body = await request.json()
  const { media_id } = body

  if (!media_id) {
    return NextResponse.json({ error: 'media_id required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  const { data: media } = await adminClient
    .from('gbp_media')
    .select('gbp_media_name')
    .eq('id', media_id)
    .eq('location_id', params.locationId)
    .single()

  if (!media) {
    return NextResponse.json({ error: 'Media not found' }, { status: 404 })
  }

  try {
    await deleteMedia(media.gbp_media_name)

    await adminClient
      .from('gbp_media')
      .delete()
      .eq('id', media_id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[gbp-media] Delete failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
