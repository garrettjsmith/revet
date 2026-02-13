import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchGBPProfile, normalizeGBPProfile, fetchLocationAttributes } from '@/lib/google/profiles'
import { getValidAccessToken, GoogleAuthError } from '@/lib/google/auth'
import { sendEmail, buildProfileUpdateEmail } from '@/lib/email'

export const maxDuration = 120

/**
 * POST /api/google/profiles/sync
 *
 * Syncs GBP profile data for mapped locations.
 * Creates/updates gbp_profiles rows with full profile data.
 *
 * Body (optional): {
 *   location_ids?: string[]  // Specific location IDs to sync
 *   limit?: number           // Max locations to process (default 10)
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

  // Get GBP location mappings to sync
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

  const results: Array<{ location_id: string; name: string; ok: boolean; error?: string }> = []

  for (const mapping of mappings) {
    const locationName = mapping.external_resource_id
    const locationId = mapping.location_id!
    const displayName = mapping.external_resource_name || locationName

    try {
      // Check previous state for Google update detection
      const { data: existingProfile } = await supabase
        .from('gbp_profiles')
        .select('has_google_updated')
        .eq('location_id', locationId)
        .single()

      const wasPreviouslyUpdated = existingProfile?.has_google_updated || false

      // Fetch full profile from Google
      const raw = await fetchGBPProfile(locationName)
      const normalized = normalizeGBPProfile(raw)

      // Fetch attributes separately
      let attributes: Array<Record<string, unknown>> = []
      try {
        attributes = await fetchLocationAttributes(locationName)
      } catch {
        // Attributes may not be available for all locations
      }

      // Determine account name from mapping metadata
      const accountName = (mapping.metadata as any)?.account_name || null

      // Upsert into gbp_profiles
      const { error: upsertError } = await supabase
        .from('gbp_profiles')
        .upsert(
          {
            location_id: locationId,
            gbp_location_name: locationName,
            gbp_account_name: accountName,
            ...normalized,
            attributes: attributes.length > 0 ? attributes : normalized.raw_google_data,
            sync_status: 'active',
            last_synced_at: new Date().toISOString(),
            sync_error: null,
          },
          { onConflict: 'location_id' }
        )

      if (upsertError) {
        console.error(`[profiles/sync] Upsert error for ${locationId}:`, upsertError)
        results.push({ location_id: locationId, name: displayName, ok: false, error: upsertError.message })
      } else {
        results.push({ location_id: locationId, name: displayName, ok: true })

        // Send alert if has_google_updated just became true
        if (normalized.has_google_updated && !wasPreviouslyUpdated) {
          sendProfileUpdateAlert(supabase, locationId, displayName).catch((err) => {
            console.error(`[profiles/sync] Profile update alert failed for ${locationId}:`, err)
          })
        }

        // Flag lander AI content as stale so it gets regenerated
        supabase
          .from('local_landers')
          .update({ ai_content_stale: true })
          .eq('location_id', locationId)
          .eq('active', true)
          .not('ai_content', 'is', null)
          .then(({ error }) => {
            if (error) console.error(`[profiles/sync] Stale flag error for ${locationId}:`, error)
          })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[profiles/sync] Error for ${locationId}:`, errorMessage)

      // Mark as error in DB if profile already exists
      await supabase
        .from('gbp_profiles')
        .update({ sync_status: 'error', sync_error: errorMessage })
        .eq('location_id', locationId)

      results.push({ location_id: locationId, name: displayName, ok: false, error: errorMessage })
    }
  }

  const synced = results.filter((r) => r.ok).length

  return NextResponse.json({
    ok: true,
    locations_processed: results.length,
    profiles_synced: synced,
    results,
  })
}

// Vercel cron sends GET — delegate to the same handler
export const GET = POST

/**
 * Send email alert when Google modifies a profile.
 */
async function sendProfileUpdateAlert(
  supabase: ReturnType<typeof createAdminClient>,
  locationId: string,
  locationName: string
) {
  // Get org + slug for building the profile URL
  const { data: location } = await supabase
    .from('locations')
    .select('org_id, organizations(slug)')
    .eq('id', locationId)
    .single()

  if (!location) return

  const orgSlug = (location.organizations as any)?.slug
  if (!orgSlug) return

  const profileUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.revet.app'}/admin/${orgSlug}/locations/${locationId}/gbp-profile`

  // Get agency admin emails
  const { data: admins } = await supabase
    .from('org_members')
    .select('email:auth_users(email)')
    .eq('org_id', (location as any).org_id)
    .eq('is_agency_admin', true)

  const emails = (admins || [])
    .map((a: any) => a.email?.email)
    .filter(Boolean) as string[]

  if (emails.length === 0) return

  sendEmail({
    to: emails,
    subject: `Profile update detected: ${locationName}`,
    html: buildProfileUpdateEmail({ locationName, profileUrl }),
  }).catch((err) => {
    console.error('[profiles/sync] Profile update email failed:', err)
  })
}
