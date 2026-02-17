import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateLanderContent } from '@/lib/ai/generate-lander-content'
import type { Location, GBPProfile, Review } from '@/lib/types'

export const maxDuration = 30

export async function POST(request: NextRequest) {
  const supabase = createServerSupabase()

  // Verify agency admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: adminCheck } = await supabase
    .from('org_members')
    .select('is_agency_admin')
    .eq('user_id', user.id)
    .eq('is_agency_admin', true)
    .limit(1)

  if (!adminCheck || adminCheck.length === 0) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const { lander_id } = await request.json()
  if (!lander_id) {
    return NextResponse.json({ error: 'Missing lander_id' }, { status: 400 })
  }

  // Use admin client to fetch all data (no RLS constraints)
  const admin = createAdminClient()

  const { data: lander } = await admin
    .from('local_landers')
    .select('*')
    .eq('id', lander_id)
    .single()

  if (!lander) {
    return NextResponse.json({ error: 'Lander not found' }, { status: 404 })
  }

  // Fetch location + GBP + reviews in parallel
  const [locationResult, gbpResult, reviewsResult] = await Promise.all([
    admin.from('locations').select('*').eq('id', lander.location_id).single(),
    admin.from('gbp_profiles').select('*').eq('location_id', lander.location_id).single(),
    admin.from('reviews')
      .select('rating, body')
      .eq('location_id', lander.location_id)
      .gte('rating', 3)
      .order('published_at', { ascending: false })
      .limit(50),
  ])

  const location = locationResult.data as Location | null
  if (!location) {
    return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  }

  const gbp = gbpResult.data as GBPProfile | null
  const reviews = (reviewsResult.data || []) as Pick<Review, 'rating' | 'body'>[]

  // Build address string
  const addressParts = [location.address_line1, location.address_line2].filter(Boolean)
  const cityState = [location.city, location.state].filter(Boolean).join(', ')
  if (cityState) addressParts.push(cityState)
  if (location.postal_code && addressParts.length > 0) {
    addressParts[addressParts.length - 1] += ` ${location.postal_code}`
  }
  const address = addressParts.join(', ') || null

  // Build services list from GBP categories
  const services: string[] = []
  if (gbp?.primary_category_name) services.push(gbp.primary_category_name)
  if (gbp?.additional_categories) {
    for (const cat of gbp.additional_categories) {
      if (cat.displayName) services.push(cat.displayName)
    }
  }

  // Extract review themes (simple: pull keywords from positive reviews)
  let reviewSummary: { averageRating: number; reviewCount: number; themes: string[] } | null = null
  const bodies = reviews
    .filter((r) => r.body)
    .map((r) => r.body!)
  if (reviews.length > 0) {
    const totalRating = reviews.reduce((sum, r) => sum + (r.rating || 0), 0)
    const themes = extractReviewThemes(bodies.slice(0, 20))
    reviewSummary = {
      averageRating: totalRating / reviews.length,
      reviewCount: reviews.length,
      themes,
    }
  }

  // Extract actual review excerpts (first ~150 chars of up to 10 reviews)
  const reviewExcerpts = bodies
    .slice(0, 10)
    .map((b) => b.length > 150 ? b.slice(0, 147) + '...' : b)

  // Parse GBP attributes into a simpler shape
  const gbpAttributes = (gbp?.attributes || []).map((attr: any) => ({
    name: attr.name || attr.attributeId || '',
    values: attr.values || (attr.repeatedEnumValue?.setValues || []),
  })).filter((a: any) => a.name)

  // Parse GBP service items
  const gbpServiceItems = (gbp?.service_items || []).map((item: any) => {
    const freeLabel = item.freeFormServiceItem?.label
    const freeName = typeof freeLabel === 'object' ? freeLabel?.displayName : freeLabel
    return {
      name: item.structuredServiceItem?.description || freeName || '',
      description: freeName || undefined,
    }
  }).filter((s: any) => s.name)

  try {
    const aiContent = await generateLanderContent({
      businessName: gbp?.business_name || location.name,
      category: gbp?.primary_category_name || null,
      address,
      city: location.city,
      state: location.state,
      locationType: location.type,
      description: gbp?.description || null,
      services,
      reviewSummary,
      templateId: lander.template_id || 'general',
      gbpAttributes: gbpAttributes.length > 0 ? gbpAttributes : null,
      gbpServiceItems: gbpServiceItems.length > 0 ? gbpServiceItems : null,
      reviewExcerpts: reviewExcerpts.length > 0 ? reviewExcerpts : null,
    })

    // Save to database and clear stale flag
    const { error: updateError } = await admin
      .from('local_landers')
      .update({
        ai_content: aiContent,
        ai_content_generated_at: new Date().toISOString(),
        ai_content_stale: false,
      })
      .eq('id', lander_id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ ai_content: aiContent })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * Extract simple review themes from review bodies.
 * Returns top recurring descriptive phrases.
 */
function extractReviewThemes(bodies: string[]): string[] {
  const text = bodies.join(' ').toLowerCase()
  // Common positive theme indicators
  const themePatterns = [
    'friendly', 'helpful', 'professional', 'knowledgeable', 'clean',
    'fast', 'quick', 'great service', 'excellent', 'welcoming',
    'patient', 'thorough', 'efficient', 'courteous', 'responsive',
    'reliable', 'trustworthy', 'convenient', 'affordable', 'on time',
  ]
  return themePatterns.filter((theme) => text.includes(theme)).slice(0, 5)
}
