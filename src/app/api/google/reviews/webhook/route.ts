import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchGoogleReviews, normalizeGoogleReview } from '@/lib/google/reviews'
import { getValidAccessToken } from '@/lib/google/auth'

/**
 * POST /api/google/reviews/webhook
 *
 * Receives Google Pub/Sub push notifications for new/updated reviews.
 *
 * Pub/Sub message format:
 * {
 *   "message": {
 *     "data": "<base64 encoded JSON>",
 *     "messageId": "...",
 *     "publishTime": "..."
 *   },
 *   "subscription": "projects/.../subscriptions/..."
 * }
 *
 * Decoded data contains: { location_name, review_name, ... }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Decode Pub/Sub message
    const messageData = body.message?.data
    if (!messageData) {
      // Acknowledge but ignore malformed messages
      return NextResponse.json({ ok: true })
    }

    const decoded = JSON.parse(Buffer.from(messageData, 'base64').toString('utf8'))
    const locationName = decoded.location_name // e.g. "accounts/123/locations/456"

    if (!locationName) {
      return NextResponse.json({ ok: true })
    }

    // Verify we have a valid Google token
    try {
      await getValidAccessToken()
    } catch {
      console.error('[google/webhook] Cannot process — Google auth invalid')
      return NextResponse.json({ ok: true }) // ACK to prevent redelivery
    }

    const supabase = createAdminClient()

    // Find the matching review source by GBP location name
    // Look in integration mappings first
    const { data: mapping } = await supabase
      .from('agency_integration_mappings')
      .select('location_id')
      .eq('resource_type', 'gbp_location')
      .eq('external_resource_id', locationName)
      .limit(1)
      .single()

    if (!mapping) {
      console.warn(`[google/webhook] No mapping for location: ${locationName}`)
      return NextResponse.json({ ok: true })
    }

    // Find the review source
    const { data: source } = await supabase
      .from('review_sources')
      .select('id')
      .eq('location_id', mapping.location_id)
      .eq('platform', 'google')
      .limit(1)
      .single()

    if (!source) {
      console.warn(`[google/webhook] No review source for location_id: ${mapping.location_id}`)
      return NextResponse.json({ ok: true })
    }

    // Fetch latest reviews from Google
    const data = await fetchGoogleReviews(locationName, {
      pageSize: 10,
      orderBy: 'updateTime desc',
    })

    if (!data.reviews || data.reviews.length === 0) {
      return NextResponse.json({ ok: true })
    }

    // Normalize and sync
    const normalizedReviews = data.reviews.map(normalizeGoogleReview)

    const apiKey = process.env.REVIEW_SYNC_API_KEY
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/reviews/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey ? `Bearer ${apiKey}` : '',
      },
      body: JSON.stringify({
        source_id: source.id,
        reviews: normalizedReviews,
        trigger: 'pubsub',
      }),
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[google/webhook] Error:', err)
    // Always return 200 to Pub/Sub to prevent redelivery of poison messages
    return NextResponse.json({ ok: true })
  }
}
