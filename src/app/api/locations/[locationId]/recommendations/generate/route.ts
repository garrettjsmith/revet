import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAgencyAdmin } from '@/lib/locations'
import { auditGBPProfile, type AuditResult } from '@/lib/ai/profile-audit'
import { generateProfileDescription, suggestCategories } from '@/lib/ai/profile-optimize'
import type { GBPProfile } from '@/lib/types'
import { randomUUID } from 'crypto'

export const maxDuration = 60

/**
 * POST /api/locations/[locationId]/recommendations/generate
 *
 * Runs audit → generates AI recommendations → inserts as batch.
 * Agency admin only.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const adminClient = createAdminClient()
  const locationId = params.locationId

  // Check for existing pending recommendations
  const { count: pendingCount } = await adminClient
    .from('profile_recommendations')
    .select('id', { count: 'exact', head: true })
    .eq('location_id', locationId)
    .in('status', ['pending', 'approved', 'client_review'])

  if (pendingCount && pendingCount > 0) {
    return NextResponse.json(
      { error: 'Location has pending recommendations. Resolve them first.' },
      { status: 409 }
    )
  }

  // Fetch location + profile
  const [{ data: location }, { data: profile }] = await Promise.all([
    adminClient
      .from('locations')
      .select('id, org_id, name, city, state')
      .eq('id', locationId)
      .single(),
    adminClient
      .from('gbp_profiles')
      .select('*')
      .eq('location_id', locationId)
      .single(),
  ])

  if (!location) {
    return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  }
  if (!profile) {
    return NextResponse.json({ error: 'No GBP profile found' }, { status: 404 })
  }

  // Fetch supporting data for audit
  const [mediaResult, reviewResult, postResult, reviewSource] = await Promise.all([
    adminClient
      .from('gbp_media')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', locationId),
    adminClient
      .from('reviews')
      .select('id, reply_body', { count: 'exact' })
      .eq('location_id', locationId),
    adminClient
      .from('gbp_posts')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', locationId)
      .eq('state', 'LIVE'),
    adminClient
      .from('review_sources')
      .select('average_rating')
      .eq('location_id', locationId)
      .eq('platform', 'google')
      .single(),
  ])

  const mediaCount = mediaResult.count || 0
  const reviewCount = reviewResult.count || 0
  const reviews = reviewResult.data || []
  const repliedCount = reviews.filter((r: { reply_body: string | null }) => r.reply_body).length
  const responseRate = reviewCount > 0 ? repliedCount / reviewCount : 0
  const postCount = postResult.count || 0

  // Run audit
  const audit: AuditResult = auditGBPProfile({
    profile: profile as GBPProfile,
    mediaCount,
    reviewCount,
    avgRating: reviewSource?.data?.average_rating ? Number(reviewSource.data.average_rating) : null,
    responseRate,
    postCount,
  })

  // Save audit to history
  await adminClient.from('audit_history').insert({
    location_id: locationId,
    score: audit.score,
    sections: audit.sections,
  })

  // Find sections that need improvement (not 'good')
  const actionableSections = audit.sections.filter(
    (s) => s.status !== 'good' && s.suggestion
  )

  if (actionableSections.length === 0) {
    // Update setup status
    await adminClient
      .from('locations')
      .update({ setup_status: 'optimized' })
      .eq('id', locationId)

    return NextResponse.json({
      audit,
      recommendations: [],
      message: 'Profile is already well optimized.',
    })
  }

  // Fetch AI corrections for this location/org for context
  const { data: corrections } = await adminClient
    .from('ai_corrections')
    .select('field, original_text, corrected_text')
    .eq('org_id', location.org_id)
    .order('created_at', { ascending: false })
    .limit(10)

  // Fetch brand config for AI context
  const { data: brandConfig } = await adminClient
    .from('brand_config')
    .select('brand_voice')
    .eq('org_id', location.org_id)
    .single()

  const brandVoice = brandConfig?.brand_voice || null

  // Generate AI recommendations for actionable fields
  const batchId = randomUUID()
  const recommendations: Array<{
    location_id: string
    batch_id: string
    field: string
    current_value: unknown
    proposed_value: unknown
    ai_rationale: string
    requires_client_approval: boolean
  }> = []

  for (const section of actionableSections) {
    try {
      if (section.key === 'description') {
        // Get existing services from service_items
        const services = (profile.service_items || [])
          .map((s: Record<string, unknown>) => {
            const freeLabel = (s as any).freeFormServiceItem?.label
            return (s as any).structuredServiceItem?.description || (typeof freeLabel === 'object' ? freeLabel?.displayName : freeLabel) || ''
          })
          .filter(Boolean) as string[]

        const correctionsContext = (corrections || [])
          .filter((c) => c.field === 'description')
          .map((c) => `Changed "${c.original_text.slice(0, 80)}..." to "${c.corrected_text.slice(0, 80)}..."`)
          .join('\n')

        const proposed = await generateProfileDescription({
          businessName: profile.business_name || location.name,
          category: profile.primary_category_name,
          city: location.city,
          state: location.state,
          services,
          currentDescription: profile.description,
          brandVoice,
          correctionsContext: correctionsContext || undefined,
        })

        recommendations.push({
          location_id: locationId,
          batch_id: batchId,
          field: 'description',
          current_value: profile.description || null,
          proposed_value: proposed,
          ai_rationale: section.suggestion!,
          requires_client_approval: true,
        })
      } else if (section.key === 'categories') {
        const services = (profile.service_items || [])
          .map((s: Record<string, unknown>) => {
            const freeLabel = (s as any).freeFormServiceItem?.label
            return (s as any).structuredServiceItem?.description || (typeof freeLabel === 'object' ? freeLabel?.displayName : freeLabel) || ''
          })
          .filter(Boolean) as string[]

        const currentCategories = [
          profile.primary_category_name,
          ...(profile.additional_categories || []).map((c: { displayName: string }) => c.displayName),
        ].filter(Boolean) as string[]

        const suggested = await suggestCategories({
          businessName: profile.business_name || location.name,
          currentCategories,
          services,
        })

        if (suggested.length > 0) {
          recommendations.push({
            location_id: locationId,
            batch_id: batchId,
            field: 'categories',
            current_value: currentCategories,
            proposed_value: suggested,
            ai_rationale: section.suggestion!,
            requires_client_approval: false,
          })
        }
      } else if (section.key === 'hours' && !((profile.regular_hours?.periods || []).length > 0)) {
        // Can't AI-generate hours — just flag it
        recommendations.push({
          location_id: locationId,
          batch_id: batchId,
          field: 'hours',
          current_value: null,
          proposed_value: null,
          ai_rationale: section.suggestion!,
          requires_client_approval: false,
        })
      }
      // attributes, photos, reviews, activity — not AI-generatable, just informational via audit
    } catch (err) {
      console.error(`[recommendations] Failed to generate for ${section.key}:`, err)
    }
  }

  if (recommendations.length > 0) {
    await adminClient.from('profile_recommendations').insert(recommendations)

    // Update setup status
    await adminClient
      .from('locations')
      .update({ setup_status: 'audited' })
      .eq('id', locationId)
  }

  return NextResponse.json({
    audit,
    recommendations,
    batch_id: batchId,
  })
}
