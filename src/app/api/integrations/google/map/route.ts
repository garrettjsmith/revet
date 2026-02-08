import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/integrations/google/map
 *
 * Saves GBP location → Revet location mappings.
 * Optionally auto-creates Revet locations for unmapped GBP locations.
 * Also creates review_sources for each mapped location.
 *
 * Body: {
 *   mappings: Array<{
 *     gbp_location_name: string   // "locations/abc123"
 *     gbp_location_title: string  // Business name from GBP
 *     gbp_place_id: string        // Google Place ID
 *     gbp_account_name: string    // "accounts/123"
 *     gbp_address?: { city, state, postal_code, address_line1, country }
 *     gbp_phone?: string
 *     gbp_website?: string
 *     action: 'map' | 'create'    // map to existing or create new
 *     location_id?: string        // existing Revet location ID (for action=map)
 *     org_id: string              // target org
 *   }>
 * }
 */
export async function POST(request: NextRequest) {
  // Verify agency admin
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('org_members')
    .select('is_agency_admin')
    .eq('user_id', user.id)
    .eq('is_agency_admin', true)
    .limit(1)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const body = await request.json()
  const { mappings } = body

  if (!mappings || !Array.isArray(mappings) || mappings.length === 0) {
    return NextResponse.json({ error: 'No mappings provided' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Get the Google integration
  const { data: integration } = await adminClient
    .from('agency_integrations')
    .select('id')
    .eq('provider', 'google')
    .single()

  if (!integration) {
    return NextResponse.json({ error: 'Google integration not found' }, { status: 404 })
  }

  const results: Array<{ gbp_location_name: string; location_id: string; status: string }> = []

  for (const mapping of mappings) {
    let locationId = mapping.location_id

    // Auto-create a Revet location if requested
    if (mapping.action === 'create') {
      const slug = mapping.gbp_location_title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

      const { data: newLocation, error: createError } = await adminClient
        .from('locations')
        .insert({
          org_id: mapping.org_id,
          type: 'place',
          name: mapping.gbp_location_title,
          slug,
          place_id: mapping.gbp_place_id || null,
          phone: mapping.gbp_phone || null,
          address_line1: mapping.gbp_address?.address_line1 || null,
          city: mapping.gbp_address?.city || null,
          state: mapping.gbp_address?.state || null,
          postal_code: mapping.gbp_address?.postal_code || null,
          country: mapping.gbp_address?.country || 'US',
        })
        .select('id')
        .single()

      if (createError) {
        // Try with deduplicated slug
        const { data: retry } = await adminClient
          .from('locations')
          .insert({
            org_id: mapping.org_id,
            type: 'place',
            name: mapping.gbp_location_title,
            slug: `${slug}-${Date.now().toString(36)}`,
            place_id: mapping.gbp_place_id || null,
            phone: mapping.gbp_phone || null,
            address_line1: mapping.gbp_address?.address_line1 || null,
            city: mapping.gbp_address?.city || null,
            state: mapping.gbp_address?.state || null,
            postal_code: mapping.gbp_address?.postal_code || null,
            country: mapping.gbp_address?.country || 'US',
          })
          .select('id')
          .single()

        if (!retry) {
          results.push({
            gbp_location_name: mapping.gbp_location_name,
            location_id: '',
            status: 'error_creating_location',
          })
          continue
        }
        locationId = retry.id
      } else {
        locationId = newLocation.id
      }
    }

    if (!locationId) {
      results.push({
        gbp_location_name: mapping.gbp_location_name,
        location_id: '',
        status: 'no_location_id',
      })
      continue
    }

    // Update the location's place_id if not set
    if (mapping.gbp_place_id) {
      await adminClient
        .from('locations')
        .update({ place_id: mapping.gbp_place_id })
        .eq('id', locationId)
        .is('place_id', null)
    }

    // Upsert the integration mapping
    await adminClient
      .from('agency_integration_mappings')
      .upsert(
        {
          integration_id: integration.id,
          external_resource_id: mapping.gbp_location_name,
          external_resource_name: mapping.gbp_location_title,
          resource_type: 'gbp_location',
          location_id: locationId,
          org_id: mapping.org_id,
          metadata: {
            place_id: mapping.gbp_place_id,
            account_name: mapping.gbp_account_name,
          },
        },
        { onConflict: 'integration_id,external_resource_id' }
      )

    // Create a review_source for Google reviews
    await adminClient
      .from('review_sources')
      .upsert(
        {
          location_id: locationId,
          platform: 'google',
          platform_listing_id: mapping.gbp_place_id || mapping.gbp_location_name,
          platform_listing_name: mapping.gbp_location_title,
          sync_status: 'pending',
          metadata: {
            gbp_location_name: mapping.gbp_location_name,
            gbp_account_name: mapping.gbp_account_name,
          },
        },
        { onConflict: 'location_id,platform,platform_listing_id' }
      )

    results.push({
      gbp_location_name: mapping.gbp_location_name,
      location_id: locationId,
      status: 'mapped',
    })
  }

  return NextResponse.json({
    ok: true,
    results,
    mapped: results.filter((r) => r.status === 'mapped').length,
    errors: results.filter((r) => r.status !== 'mapped').length,
  })
}
