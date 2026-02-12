import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { auditGBPProfile } from '@/lib/ai/profile-audit'
import type { GBPProfile } from '@/lib/types'

/**
 * POST /api/locations/[locationId]/gbp-profile/audit
 *
 * Runs a profile optimization audit. Returns score + section breakdown.
 * Any org member with location access can view.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify location access
  const { data: location } = await supabase
    .from('locations')
    .select('id')
    .eq('id', params.locationId)
    .single()

  if (!location) {
    return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  }

  const adminClient = createAdminClient()

  // Fetch profile
  const { data: profile } = await adminClient
    .from('gbp_profiles')
    .select('*')
    .eq('location_id', params.locationId)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'No GBP profile found' }, { status: 404 })
  }

  // Fetch supporting data in parallel
  const [mediaResult, reviewResult, postResult] = await Promise.all([
    adminClient
      .from('gbp_media')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', params.locationId),
    adminClient
      .from('reviews')
      .select('id, reply_body', { count: 'exact' })
      .eq('location_id', params.locationId),
    adminClient
      .from('gbp_posts')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', params.locationId)
      .eq('state', 'LIVE'),
  ])

  const mediaCount = mediaResult.count || 0
  const reviewCount = reviewResult.count || 0
  const reviews = reviewResult.data || []
  const repliedCount = reviews.filter((r: any) => r.reply_body).length
  const responseRate = reviewCount > 0 ? repliedCount / reviewCount : 0
  const postCount = postResult.count || 0

  // Get average rating from review source
  const { data: reviewSource } = await adminClient
    .from('review_sources')
    .select('average_rating')
    .eq('location_id', params.locationId)
    .eq('platform', 'google')
    .single()

  const audit = auditGBPProfile({
    profile: profile as GBPProfile,
    mediaCount,
    reviewCount,
    avgRating: reviewSource?.average_rating ? Number(reviewSource.average_rating) : null,
    responseRate,
    postCount,
  })

  return NextResponse.json(audit)
}
