import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAgencyAdmin } from '@/lib/locations'
import {
  updateGBPProfile,
  fetchGBPProfile,
  normalizeGBPProfile,
  fetchLocationAttributes,
} from '@/lib/google/profiles'
import { getValidAccessToken, GoogleAuthError } from '@/lib/google/auth'
import type { GBPProfileRaw } from '@/lib/google/profiles'

export const maxDuration = 120

interface BulkEditRequest {
  location_ids: string[]
  fields: {
    description?: string
    phone_primary?: string
    website_uri?: string
    categories?: {
      primary?: { id: string; displayName: string }
      additional?: Array<{ id: string; displayName: string }>
    }
    regular_hours?: {
      periods: Array<{
        openDay: string
        openTime: string
        closeDay: string
        closeTime: string
      }>
    }
  }
}

interface ResultItem {
  location_id: string
  name: string
  status: 'updated' | 'skipped' | 'error'
  error?: string
}

/**
 * POST /api/locations/bulk-edit
 *
 * Apply profile edits to multiple locations.
 * Agency admin only. Sequential processing with rate limiting.
 */
export async function POST(request: NextRequest) {
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

  const body: BulkEditRequest = await request.json()
  const { location_ids, fields } = body

  if (!location_ids || location_ids.length === 0) {
    return NextResponse.json({ error: 'location_ids required' }, { status: 400 })
  }

  if (location_ids.length > 200) {
    return NextResponse.json({ error: 'Max 200 locations per request' }, { status: 400 })
  }

  // Build the Google API update payload from fields
  const googleFields: Partial<GBPProfileRaw> = {}
  const updateMaskParts: string[] = []

  if (fields.description !== undefined) {
    googleFields.profile = { description: fields.description }
    updateMaskParts.push('profile.description')
  }

  if (fields.phone_primary !== undefined) {
    googleFields.phoneNumbers = { primaryPhone: fields.phone_primary }
    updateMaskParts.push('phoneNumbers.primaryPhone')
  }

  if (fields.website_uri !== undefined) {
    googleFields.websiteUri = fields.website_uri
    updateMaskParts.push('websiteUri')
  }

  if (fields.categories) {
    const catPayload: GBPProfileRaw['categories'] = {}
    if (fields.categories.primary) {
      catPayload.primaryCategory = {
        name: `categories/${fields.categories.primary.id}`,
        displayName: fields.categories.primary.displayName,
      }
    }
    if (fields.categories.additional) {
      catPayload.additionalCategories = fields.categories.additional.map((c) => ({
        name: `categories/${c.id}`,
        displayName: c.displayName,
      }))
    }
    googleFields.categories = catPayload
    updateMaskParts.push('categories')
  }

  if (fields.regular_hours) {
    googleFields.regularHours = { periods: fields.regular_hours.periods || [] }
    updateMaskParts.push('regularHours')
  }

  if (updateMaskParts.length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const updateMask = updateMaskParts.join(',')
  const adminClient = createAdminClient()

  // Pre-fetch all GBP profiles for these locations
  const { data: profiles } = await adminClient
    .from('gbp_profiles')
    .select('location_id, gbp_location_name, gbp_account_name')
    .in('location_id', location_ids)

  const profileMap = new Map(
    (profiles || []).map((p) => [p.location_id, p])
  )

  // Also fetch location names for display
  const { data: locations } = await adminClient
    .from('locations')
    .select('id, name')
    .in('id', location_ids)

  const locationNames = new Map(
    (locations || []).map((l) => [l.id, l.name])
  )

  const results: ResultItem[] = []

  for (const locationId of location_ids) {
    const profile = profileMap.get(locationId)
    const displayName = locationNames.get(locationId) || locationId

    if (!profile) {
      results.push({ location_id: locationId, name: displayName, status: 'skipped', error: 'No GBP profile' })
      continue
    }

    try {
      await updateGBPProfile(profile.gbp_location_name, googleFields, updateMask)

      // Re-fetch from Google to get canonical state
      const raw = await fetchGBPProfile(profile.gbp_location_name)
      const normalized = normalizeGBPProfile(raw)

      let attributes: Array<Record<string, unknown>> = []
      try {
        attributes = await fetchLocationAttributes(profile.gbp_location_name)
      } catch {
        // Attributes may not be available
      }

      await adminClient
        .from('gbp_profiles')
        .update({
          ...normalized,
          attributes: attributes.length > 0 ? attributes : undefined,
          last_pushed_at: new Date().toISOString(),
          last_synced_at: new Date().toISOString(),
          sync_status: 'active',
          sync_error: null,
        })
        .eq('location_id', locationId)

      results.push({ location_id: locationId, name: displayName, status: 'updated' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[bulk-edit] Error for ${locationId}:`, message)

      await adminClient
        .from('gbp_profiles')
        .update({ sync_error: message })
        .eq('location_id', locationId)

      results.push({ location_id: locationId, name: displayName, status: 'error', error: message })
    }

    // Rate limit: ~200ms delay between Google API calls
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  const updated = results.filter((r) => r.status === 'updated').length
  const skipped = results.filter((r) => r.status === 'skipped').length
  const errors = results.filter((r) => r.status === 'error').length

  return NextResponse.json({
    ok: true,
    summary: { updated, skipped, errors, total: results.length },
    results,
  })
}
