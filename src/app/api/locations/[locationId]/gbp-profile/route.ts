import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAgencyAdmin } from '@/lib/locations'
import {
  updateGBPProfile,
  fetchGBPProfile,
  normalizeGBPProfile,
  updateLocationAttributes,
  fetchLocationAttributes,
} from '@/lib/google/profiles'
import { getValidAccessToken, GoogleAuthError } from '@/lib/google/auth'
import type { GBPProfileRaw } from '@/lib/google/profiles'

/**
 * PUT /api/locations/[locationId]/gbp-profile
 *
 * Pushes profile edits to Google and re-syncs.
 * Agency admin only.
 */
export async function PUT(
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

  const adminClient = createAdminClient()

  // Get the GBP profile for this location
  const { data: profile } = await adminClient
    .from('gbp_profiles')
    .select('gbp_location_name, gbp_account_name')
    .eq('location_id', params.locationId)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'No GBP profile found for this location' }, { status: 404 })
  }

  const body = await request.json()
  const { description, phone_primary, website_uri, categories, regular_hours } = body

  // Build the Google API update payload
  const fields: Partial<GBPProfileRaw> = {}
  const updateMaskParts: string[] = []

  if (description !== undefined) {
    fields.profile = { description }
    updateMaskParts.push('profile.description')
  }

  if (phone_primary !== undefined) {
    fields.phoneNumbers = { primaryPhone: phone_primary }
    updateMaskParts.push('phoneNumbers.primaryPhone')
  }

  if (website_uri !== undefined) {
    fields.websiteUri = website_uri
    updateMaskParts.push('websiteUri')
  }

  if (categories) {
    const catPayload: GBPProfileRaw['categories'] = {}
    if (categories.primary) {
      catPayload.primaryCategory = {
        name: `categories/${categories.primary.id}`,
        displayName: categories.primary.displayName,
      }
    }
    if (categories.additional) {
      catPayload.additionalCategories = categories.additional.map((c: { id: string; displayName: string }) => ({
        name: `categories/${c.id}`,
        displayName: c.displayName,
      }))
    }
    fields.categories = catPayload
    updateMaskParts.push('categories')
  }

  if (regular_hours) {
    fields.regularHours = { periods: regular_hours.periods || [] }
    updateMaskParts.push('regularHours')
  }

  if (updateMaskParts.length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  try {
    // Push to Google
    await updateGBPProfile(
      profile.gbp_location_name,
      fields,
      updateMaskParts.join(',')
    )

    // Re-fetch from Google to get the canonical state
    const raw = await fetchGBPProfile(profile.gbp_location_name)
    const normalized = normalizeGBPProfile(raw)

    // Fetch attributes separately
    let attributes: Array<Record<string, unknown>> = []
    try {
      attributes = await fetchLocationAttributes(profile.gbp_location_name)
    } catch {
      // Attributes may not be available
    }

    // Update our DB
    const { data: updated, error: updateError } = await adminClient
      .from('gbp_profiles')
      .update({
        ...normalized,
        attributes: attributes.length > 0 ? attributes : undefined,
        last_pushed_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        sync_status: 'active',
        sync_error: null,
      })
      .eq('location_id', params.locationId)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update local profile' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, profile: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[gbp-profile] Update failed:', message)

    // Mark sync error in DB
    await adminClient
      .from('gbp_profiles')
      .update({ sync_error: message })
      .eq('location_id', params.locationId)

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
