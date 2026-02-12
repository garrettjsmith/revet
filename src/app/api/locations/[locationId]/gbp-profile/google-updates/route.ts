import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAgencyAdmin } from '@/lib/locations'
import {
  fetchGBPProfile,
  normalizeGBPProfile,
  updateGBPProfile,
} from '@/lib/google/profiles'
import { getValidAccessToken, GoogleAuthError } from '@/lib/google/auth'
import type { GBPProfile } from '@/lib/types'
import type { GBPProfileRaw } from '@/lib/google/profiles'

interface FieldDiff {
  field: string
  label: string
  currentValue: string | null
  googleValue: string | null
}

/**
 * GET /api/locations/[locationId]/gbp-profile/google-updates
 *
 * Fetches the current Google version and compares with our stored data.
 * Returns a diff of changed fields.
 */
export async function GET(
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
  const { data: profile } = await adminClient
    .from('gbp_profiles')
    .select('*')
    .eq('location_id', params.locationId)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'No GBP profile found' }, { status: 404 })
  }

  const gbp = profile as GBPProfile

  try {
    // Fetch live data from Google
    const raw = await fetchGBPProfile(gbp.gbp_location_name)
    const normalized = normalizeGBPProfile(raw)

    // Compare key fields
    const diffs: FieldDiff[] = []

    if (normalized.business_name !== gbp.business_name) {
      diffs.push({
        field: 'business_name',
        label: 'Business Name',
        currentValue: gbp.business_name,
        googleValue: normalized.business_name,
      })
    }

    if (normalized.description !== gbp.description) {
      diffs.push({
        field: 'description',
        label: 'Description',
        currentValue: gbp.description,
        googleValue: normalized.description,
      })
    }

    if (normalized.phone_primary !== gbp.phone_primary) {
      diffs.push({
        field: 'phone_primary',
        label: 'Phone',
        currentValue: gbp.phone_primary,
        googleValue: normalized.phone_primary,
      })
    }

    if (normalized.website_uri !== gbp.website_uri) {
      diffs.push({
        field: 'website_uri',
        label: 'Website',
        currentValue: gbp.website_uri,
        googleValue: normalized.website_uri,
      })
    }

    if (normalized.primary_category_name !== gbp.primary_category_name) {
      diffs.push({
        field: 'primary_category',
        label: 'Primary Category',
        currentValue: gbp.primary_category_name,
        googleValue: normalized.primary_category_name,
      })
    }

    if (normalized.open_status !== gbp.open_status) {
      diffs.push({
        field: 'open_status',
        label: 'Open Status',
        currentValue: gbp.open_status,
        googleValue: normalized.open_status,
      })
    }

    return NextResponse.json({ diffs, hasChanges: diffs.length > 0 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[google-updates] Fetch failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/locations/[locationId]/gbp-profile/google-updates
 *
 * Accept or reject Google's suggested changes.
 * Body: { action: 'accept' | 'reject' }
 *   - accept: re-sync from Google (accept their changes)
 *   - reject: push our current data back to Google
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
  const { action } = body

  if (!action || !['accept', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const { data: profile } = await adminClient
    .from('gbp_profiles')
    .select('*')
    .eq('location_id', params.locationId)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'No GBP profile found' }, { status: 404 })
  }

  const gbp = profile as GBPProfile

  try {
    if (action === 'accept') {
      // Re-fetch from Google and accept their version
      const raw = await fetchGBPProfile(gbp.gbp_location_name)
      const normalized = normalizeGBPProfile(raw)

      await adminClient
        .from('gbp_profiles')
        .update({
          ...normalized,
          has_google_updated: false,
          last_synced_at: new Date().toISOString(),
          sync_status: 'active',
          sync_error: null,
        })
        .eq('location_id', params.locationId)

      return NextResponse.json({ ok: true, action: 'accepted' })
    }

    if (action === 'reject') {
      // Push our current data back to Google
      const fields: Partial<GBPProfileRaw> = {
        title: gbp.business_name || undefined,
        websiteUri: gbp.website_uri || undefined,
        phoneNumbers: gbp.phone_primary ? { primaryPhone: gbp.phone_primary } : undefined,
        profile: gbp.description ? { description: gbp.description } : undefined,
      }

      const maskParts = [
        'title',
        'websiteUri',
        'phoneNumbers.primaryPhone',
        'profile.description',
      ]

      await updateGBPProfile(gbp.gbp_location_name, fields, maskParts.join(','))

      // Mark as resolved
      await adminClient
        .from('gbp_profiles')
        .update({
          has_google_updated: false,
          last_pushed_at: new Date().toISOString(),
        })
        .eq('location_id', params.locationId)

      return NextResponse.json({ ok: true, action: 'rejected' })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[google-updates] Action failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
