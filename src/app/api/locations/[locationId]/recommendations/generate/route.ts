import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAgencyAdmin } from '@/lib/locations'
import { verifyCronSecret } from '@/lib/cron-auth'
import { auditGBPProfile, type AuditResult } from '@/lib/ai/profile-audit'
import {
  generateProfileDescription,
  suggestCategories,
  recommendAttributes,
  parseHoursToGBP,
  generateServiceDescriptions,
  generatePhotoShotList,
} from '@/lib/ai/profile-optimize'
import {
  fetchAvailableAttributes,
  fetchLocationAttributes,
} from '@/lib/google/profiles'
import { getValidAccessToken } from '@/lib/google/auth'
import type { GBPProfile } from '@/lib/types'
import { randomUUID } from 'crypto'
import { completePhase, advancePipeline } from '@/lib/pipeline'

export const maxDuration = 60

/**
 * POST /api/locations/[locationId]/recommendations/generate
 *
 * Runs audit → generates AI recommendations → inserts as batch.
 * Auth: agency admin session OR CRON_SECRET bearer token (for server-side triggers).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  // Accept either agency admin session or CRON_SECRET for server-side triggers
  const cronAuth = verifyCronSecret(request)
  const isCronAuth = cronAuth === null

  if (!isCronAuth) {
    const isAdmin = await checkAgencyAdmin()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
    }
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

  // Fetch intake data, corrections, and brand config for all AI generators
  const [{ data: intakeRow }, { data: corrections }, { data: brandConfig }] = await Promise.all([
    adminClient.from('locations').select('intake_data').eq('id', locationId).single(),
    adminClient
      .from('ai_corrections')
      .select('field, original_text, corrected_text')
      .eq('org_id', location.org_id)
      .order('created_at', { ascending: false })
      .limit(10),
    adminClient.from('brand_config').select('brand_voice, voice_selections').eq('org_id', location.org_id).single(),
  ])

  const intake = (intakeRow as any)?.intake_data || {}

  if (actionableSections.length === 0) {
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

  // Build enriched brand voice from voice_selections + intake
  let brandVoice = brandConfig?.brand_voice || ''
  if (brandConfig?.voice_selections) {
    const vs = brandConfig.voice_selections
    brandVoice = [vs.personality, ...(vs.tone || []), vs.formality, vs.notes].filter(Boolean).join('. ')
  }
  if (intake.highlights?.length) brandVoice += `\nBusiness highlights: ${intake.highlights.join(', ')}`
  if (intake.keywords?.length) brandVoice += `\nTarget keywords: ${intake.keywords.join(', ')}`
  if (intake.founding_year) brandVoice += `\nEstablished: ${intake.founding_year}${intake.founding_city ? ` in ${intake.founding_city}` : ''}`

  // Merge services from profile + intake
  const profileServices = (profile.service_items || [])
    .map((s: Record<string, any>) => {
      const freeLabel = s.freeFormServiceItem?.label
      return s.structuredServiceItem?.description || (typeof freeLabel === 'object' ? freeLabel?.displayName : freeLabel) || ''
    })
    .filter(Boolean) as string[]
  const intakeServices = (intake.services || []).map((s: { name: string }) => s.name)
  const allServices = Array.from(new Set([...profileServices, ...intakeServices]))

  // Generate AI recommendations for ALL actionable fields
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

  // Also check services and website even if their audit section is 'good'
  // (they don't have audit sections but still need optimization)
  const sectionKeys = new Set(actionableSections.map((s) => s.key))

  for (const section of actionableSections) {
    try {
      if (section.key === 'description') {
        const correctionsContext = (corrections || [])
          .filter((c) => c.field === 'description')
          .map((c) => `Changed "${c.original_text.slice(0, 80)}..." to "${c.corrected_text.slice(0, 80)}..."`)
          .join('\n')

        const proposed = await generateProfileDescription({
          businessName: profile.business_name || location.name,
          category: profile.primary_category_name,
          city: location.city,
          state: location.state,
          services: allServices,
          currentDescription: profile.description,
          brandVoice: brandVoice || null,
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
        const currentCategories = [
          profile.primary_category_name,
          ...(profile.additional_categories || []).map((c: { displayName: string }) => c.displayName),
        ].filter(Boolean) as string[]

        const suggested = await suggestCategories({
          businessName: profile.business_name || location.name,
          currentCategories,
          services: allServices,
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
      } else if (section.key === 'hours') {
        if (intake.hours_of_operation) {
          const parsedPeriods = await parseHoursToGBP({
            hoursText: intake.hours_of_operation,
            businessName: profile.business_name || location.name,
            category: profile.primary_category_name,
          })

          recommendations.push({
            location_id: locationId,
            batch_id: batchId,
            field: 'hours',
            current_value: profile.regular_hours || null,
            proposed_value: parsedPeriods.length > 0
              ? { periods: parsedPeriods, from_intake: intake.hours_of_operation }
              : { from_intake: intake.hours_of_operation, parse_failed: true },
            ai_rationale: parsedPeriods.length > 0
              ? `Parsed hours from intake: "${intake.hours_of_operation}" → ${parsedPeriods.length} periods. Ready to push to GBP.`
              : `Could not auto-parse hours from intake: "${intake.hours_of_operation}". Needs manual entry.`,
            requires_client_approval: false,
          })
        } else {
          recommendations.push({
            location_id: locationId,
            batch_id: batchId,
            field: 'hours',
            current_value: null,
            proposed_value: { action_needed: 'Request hours from client.' },
            ai_rationale: section.suggestion!,
            requires_client_approval: false,
          })
        }
      } else if (section.key === 'attributes') {
        if (profile.primary_category_id) {
          try {
            await getValidAccessToken()
            const [available, current] = await Promise.all([
              fetchAvailableAttributes(profile.primary_category_id),
              fetchLocationAttributes(profile.gbp_location_name),
            ])

            const currentIds = new Set(current.map((a: any) => a.name?.split('/').pop() || ''))
            const unset = available.filter((a) => !currentIds.has(a.attributeId))

            if (unset.length > 0) {
              const attrRecs = await recommendAttributes({
                businessName: profile.business_name || '',
                category: profile.primary_category_name,
                services: allServices,
                highlights: intake.highlights || [],
                availableAttributes: unset,
              })

              if (attrRecs.length > 0) {
                const attrNames = attrRecs.map((r) => {
                  const meta = unset.find((a) => a.attributeId === r.attributeId)
                  return meta?.displayName || r.attributeId
                })

                recommendations.push({
                  location_id: locationId,
                  batch_id: batchId,
                  field: 'attributes',
                  current_value: { set_count: current.length },
                  proposed_value: { attributes: attrRecs, display_names: attrNames },
                  ai_rationale: `AI recommends setting ${attrRecs.length} attributes: ${attrNames.join(', ')}. Each evaluated against business services and type.`,
                  requires_client_approval: false,
                })
              }
            }
          } catch {
            // Google API not available — skip attributes
          }
        }
      } else if (section.key === 'photos') {
        const { data: media } = await adminClient
          .from('gbp_media')
          .select('category')
          .eq('location_id', locationId)

        const existingCategories = Array.from(new Set((media || []).map((m: any) => m.category).filter(Boolean)))

        const shotList = await generatePhotoShotList({
          businessName: profile.business_name || '',
          category: profile.primary_category_name,
          services: allServices,
          existingCategories,
          totalPhotos: mediaCount,
        })

        if (shotList.length > 0) {
          recommendations.push({
            location_id: locationId,
            batch_id: batchId,
            field: 'media',
            current_value: { total_photos: mediaCount, categories: existingCategories },
            proposed_value: {
              shot_list: shotList,
              cloud_folder_url: intake.cloud_folder_url || null,
              missing_essentials: [
                ...(!existingCategories.includes('COVER') ? ['COVER photo'] : []),
                ...(!existingCategories.includes('LOGO') ? ['LOGO'] : []),
              ],
            },
            ai_rationale: `${shotList.length} photos recommended for this ${profile.primary_category_name || 'business'}. ${shotList.filter((s) => s.priority === 'high').length} high-priority shots.`,
            requires_client_approval: false,
          })
        }
      }
    } catch (err) {
      console.error(`[recommendations] Failed to generate for ${section.key}:`, err)
    }
  }

  // Services — not an audit section but still needs optimization
  if (!sectionKeys.has('services')) {
    const intakeSvcList: Array<{ name: string; description?: string }> = intake.services || []
    const existingServiceNames = profileServices.map((s) => s.toLowerCase())
    const existingSet = new Set(existingServiceNames)
    const missingSvcs = intakeSvcList.filter((s) => !existingSet.has((s.name || s).toString().toLowerCase()))

    if (missingSvcs.length > 0) {
      const enriched = await generateServiceDescriptions({
        businessName: profile.business_name || '',
        category: profile.primary_category_name,
        services: missingSvcs,
      })

      const finalServices = missingSvcs.map((s) => {
        const aiDesc = enriched.find((e) => e.name.toLowerCase() === s.name.toLowerCase())
        return { name: s.name, description: s.description || aiDesc?.description || '' }
      })

      recommendations.push({
        location_id: locationId,
        batch_id: batchId,
        field: 'services',
        current_value: profileServices,
        proposed_value: { services: finalServices },
        ai_rationale: `${finalServices.length} services from intake not on profile: ${finalServices.map((s) => s.name).join(', ')}. AI-generated descriptions for each.`,
        requires_client_approval: false,
      })
    }
  }

  // Website UTM — not an audit section but still needs optimization
  if (profile.website_uri && !profile.website_uri.includes('utm_source') && !profile.website_uri.includes('utm_medium')) {
    try {
      const parsed = new URL(profile.website_uri)
      parsed.searchParams.set('utm_source', 'google')
      parsed.searchParams.set('utm_medium', 'organic')
      parsed.searchParams.set('utm_campaign', 'gbp')
      const trackedUrl = parsed.toString()

      recommendations.push({
        location_id: locationId,
        batch_id: batchId,
        field: 'website',
        current_value: profile.website_uri,
        proposed_value: trackedUrl,
        ai_rationale: 'Website URL has no UTM tracking. Adding utm_source=google&utm_medium=organic&utm_campaign=gbp enables attribution in analytics.',
        requires_client_approval: false,
      })
    } catch {
      // Invalid URL — skip
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

  // Update pipeline phases
  try {
    await completePhase(locationId, 'audit', { score: audit.score })
    if (recommendations.length > 0) {
      await completePhase(locationId, 'recommendations', { count: recommendations.length, batch_id: batchId })
    }
    await advancePipeline(locationId)
  } catch (err) {
    console.error(`[recommendations/generate] Pipeline update failed:`, err)
  }

  return NextResponse.json({
    audit,
    recommendations,
    batch_id: batchId,
  })
}
