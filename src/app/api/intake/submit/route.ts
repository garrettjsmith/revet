import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 60

/**
 * POST /api/intake/submit
 *
 * Submits the intake form. Populates brand_config, location data,
 * and triggers the optimization pipeline.
 *
 * Public endpoint (no auth — customers fill this out).
 * Requires org_id and location_id in body to scope the submission.
 */
export async function POST(request: NextRequest) {
  const body = await request.json()
  const {
    org_id,
    location_id,
    // Business info
    business_name,
    address_line1,
    city,
    state,
    postal_code,
    phone,
    website,
    category,
    hours_of_operation,
    holiday_closures,
    // Keywords & services
    keywords,
    services,
    target_cities,
    // Brand voice
    voice_selections,
    voice_notes,
    // Visual style
    style_selections,
    style_notes,
    primary_color,
    secondary_color,
    // Assets
    logo_url,
    photo_urls,
    cloud_folder_url,
    // Business details
    business_description,
    highlights,
    founding_year,
    founding_city,
    service_radius,
    // Preferences
    post_approval_mode,
    // Contact
    client_contact_phone,
    additional_notes,
  } = body

  if (!org_id || !location_id) {
    return NextResponse.json({ error: 'org_id and location_id required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Verify org and location exist
  const { data: location } = await adminClient
    .from('locations')
    .select('id, org_id')
    .eq('id', location_id)
    .eq('org_id', org_id)
    .single()

  if (!location) {
    return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  }

  // 1. Compose brand_voice string from selections
  const voiceParts: string[] = []
  if (voice_selections?.personality) voiceParts.push(voice_selections.personality)
  if (voice_selections?.tone?.length) voiceParts.push(...voice_selections.tone)
  if (voice_selections?.formality) voiceParts.push(voice_selections.formality)
  const brandVoice = voiceParts.length > 0 ? voiceParts.join(', ') : null

  // 2. Compose design_style string from selections
  const styleParts: string[] = []
  if (style_selections?.aesthetic) styleParts.push(style_selections.aesthetic)
  if (style_selections?.color_mood) styleParts.push(style_selections.color_mood)
  if (style_selections?.typography) styleParts.push(style_selections.typography)
  const designStyle = styleParts.length > 0 ? styleParts.join(', ') : null

  // 3. Determine font_style from typography selection
  const fontStyleMap: Record<string, string> = {
    'Classic & Serif': 'serif',
    'Modern & Sans-Serif': 'sans-serif',
    'Handwritten & Casual': 'handwritten',
    'Bold & Heavy': 'bold',
  }
  const fontStyle = style_selections?.typography
    ? fontStyleMap[style_selections.typography] || null
    : null

  // 4. Upsert brand_config
  const fullVoiceSelections = { ...voice_selections, notes: voice_notes }
  const fullStyleSelections = { ...style_selections, notes: style_notes }

  const { error: brandError } = await adminClient
    .from('brand_config')
    .upsert({
      org_id,
      brand_voice: brandVoice,
      design_style: designStyle,
      primary_color: primary_color || null,
      secondary_color: secondary_color || null,
      font_style: fontStyle,
      logo_url: logo_url || null,
      sample_image_urls: photo_urls || [],
      voice_selections: fullVoiceSelections,
      style_selections: fullStyleSelections,
      post_approval_mode: post_approval_mode || 'approve_first',
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'org_id',
    })

  if (brandError) {
    console.error('[intake/submit] Brand config upsert error:', brandError)
    return NextResponse.json({ error: 'Failed to save brand config' }, { status: 500 })
  }

  // 5. Update location with business info + intake data
  const intakeData = {
    keywords: keywords || [],
    services: services || [],
    target_cities: target_cities || [],
    highlights: highlights || [],
    founding_year: founding_year || null,
    founding_city: founding_city || null,
    service_radius: service_radius || null,
    hours_of_operation: hours_of_operation || null,
    holiday_closures: holiday_closures || null,
    business_description: business_description || null,
    additional_notes: additional_notes || null,
    cloud_folder_url: cloud_folder_url || null,
    client_contact_phone: client_contact_phone || null,
  }

  const locationUpdate: Record<string, unknown> = {
    intake_data: intakeData,
    intake_completed_at: new Date().toISOString(),
  }

  // Update location fields if provided
  if (business_name) locationUpdate.name = business_name
  if (address_line1) locationUpdate.address_line1 = address_line1
  if (city) locationUpdate.city = city
  if (state) locationUpdate.state = state
  if (postal_code) locationUpdate.postal_code = postal_code
  if (phone) locationUpdate.phone = phone

  const { error: locError } = await adminClient
    .from('locations')
    .update(locationUpdate)
    .eq('id', location_id)

  if (locError) {
    console.error('[intake/submit] Location update error:', locError)
    return NextResponse.json({ error: 'Failed to update location' }, { status: 500 })
  }

  // 6. Trigger the optimization pipeline asynchronously
  // Call the recommendation generation endpoint
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.revet.app'
  try {
    fetch(`${appUrl}/api/locations/${location_id}/recommendations/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {
      // Non-blocking — pipeline will run on next cron if this fails
    })
  } catch {
    // Non-blocking
  }

  return NextResponse.json({
    ok: true,
    message: 'Intake submitted successfully',
    location_id,
    org_id,
  })
}
