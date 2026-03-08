import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
import { verifyCronSecret } from '@/lib/cron-auth'

export const maxDuration = 300

/**
 * Monthly cron: Audit all active locations and generate
 * optimization recommendations where scores have dropped or
 * improvement opportunities exist.
 *
 * Runs on the 15th of each month at 10:00 UTC.
 * Only runs for standard/premium tier locations.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request)
  if (authError) return authError
  const adminClient = createAdminClient()

  // Get all active locations with GBP profiles (standard/premium only)
  const { data: locations, error: locError } = await adminClient
    .from('locations')
    .select('id, org_id, name, city, state, service_tier, setup_status')
    .in('service_tier', ['standard', 'premium'])
    .eq('active', true)
    .neq('status', 'archived')

  if (locError || !locations) {
    console.error('[profile-optimize] Failed to fetch locations:', locError)
    return NextResponse.json({ error: 'Failed to fetch locations' }, { status: 500 })
  }

  console.log(`[profile-optimize] Processing ${locations.length} locations`)

  let generated = 0
  let skipped = 0

  for (const location of locations) {
    try {
      // Skip locations with existing pending recommendations
      const { count: pendingCount } = await adminClient
        .from('profile_recommendations')
        .select('id', { count: 'exact', head: true })
        .eq('location_id', location.id)
        .in('status', ['pending', 'approved', 'client_review'])

      if (pendingCount && pendingCount > 0) {
        skipped++
        continue
      }

      // Fetch GBP profile
      const { data: profile } = await adminClient
        .from('gbp_profiles')
        .select('*')
        .eq('location_id', location.id)
        .single()

      if (!profile) {
        skipped++
        continue
      }

      // Fetch supporting data
      const [mediaResult, reviewResult, postResult, reviewSource] = await Promise.all([
        adminClient
          .from('gbp_media')
          .select('id', { count: 'exact', head: true })
          .eq('location_id', location.id),
        adminClient
          .from('reviews')
          .select('id, reply_body', { count: 'exact' })
          .eq('location_id', location.id),
        adminClient
          .from('gbp_posts')
          .select('id', { count: 'exact', head: true })
          .eq('location_id', location.id)
          .eq('state', 'LIVE'),
        adminClient
          .from('review_sources')
          .select('average_rating')
          .eq('location_id', location.id)
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
        location_id: location.id,
        score: audit.score,
        sections: audit.sections,
      })

      // Get previous audit to compare
      const { data: prevAudits } = await adminClient
        .from('audit_history')
        .select('score')
        .eq('location_id', location.id)
        .order('created_at', { ascending: false })
        .limit(2)

      const previousScore = prevAudits && prevAudits.length > 1 ? prevAudits[1].score : null

      // Only generate recommendations if:
      // 1. Score is below 80, OR
      // 2. Score dropped from previous audit
      const scoreDropped = previousScore !== null && audit.score < previousScore
      const scoreLow = audit.score < 80

      if (!scoreLow && !scoreDropped) {
        if (location.setup_status !== 'optimized') {
          await adminClient
            .from('locations')
            .update({ setup_status: 'optimized' })
            .eq('id', location.id)
        }
        skipped++
        continue
      }

      // Find actionable sections — ALL fields now, not just description + categories
      const actionableSections = audit.sections.filter(
        (s) => s.status !== 'good' && s.suggestion
      )

      // Fetch intake data, corrections, and brand config for AI context
      const [{ data: intakeRow }, { data: corrections }, { data: brandConfig }] = await Promise.all([
        adminClient.from('locations').select('intake_data').eq('id', location.id).single(),
        adminClient
          .from('ai_corrections')
          .select('field, original_text, corrected_text')
          .eq('org_id', location.org_id)
          .order('created_at', { ascending: false })
          .limit(10),
        adminClient.from('brand_config').select('brand_voice, voice_selections').eq('org_id', location.org_id).single(),
      ])

      const intake = (intakeRow as any)?.intake_data || {}

      // Build enriched brand voice
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
      const intakeServiceNames = (intake.services || []).map((s: { name: string }) => s.name)
      const allServices = Array.from(new Set([...profileServices, ...intakeServiceNames]))

      if (actionableSections.length === 0 && intakeServiceNames.length === 0) {
        skipped++
        continue
      }

      // Generate recommendations
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
              location_id: location.id,
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
                location_id: location.id,
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
                location_id: location.id,
                batch_id: batchId,
                field: 'hours',
                current_value: profile.regular_hours || null,
                proposed_value: parsedPeriods.length > 0
                  ? { periods: parsedPeriods, from_intake: intake.hours_of_operation }
                  : { from_intake: intake.hours_of_operation, parse_failed: true },
                ai_rationale: parsedPeriods.length > 0
                  ? `Parsed hours from intake → ${parsedPeriods.length} periods. Ready to push.`
                  : `Could not auto-parse hours. Needs manual entry.`,
                requires_client_approval: false,
              })
            } else {
              recommendations.push({
                location_id: location.id,
                batch_id: batchId,
                field: 'hours',
                current_value: null,
                proposed_value: { action_needed: 'Request hours from client.' },
                ai_rationale: section.suggestion!,
                requires_client_approval: false,
              })
            }
          } else if (section.key === 'attributes' && profile.primary_category_id) {
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
                    location_id: location.id,
                    batch_id: batchId,
                    field: 'attributes',
                    current_value: { set_count: current.length },
                    proposed_value: { attributes: attrRecs, display_names: attrNames },
                    ai_rationale: `AI recommends setting ${attrRecs.length} attributes: ${attrNames.join(', ')}.`,
                    requires_client_approval: false,
                  })
                }
              }
            } catch {
              // Google API not available — skip
            }
          } else if (section.key === 'photos') {
            const { data: media } = await adminClient
              .from('gbp_media')
              .select('category')
              .eq('location_id', location.id)

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
                location_id: location.id,
                batch_id: batchId,
                field: 'media',
                current_value: { total_photos: mediaCount, categories: existingCategories },
                proposed_value: {
                  shot_list: shotList,
                  cloud_folder_url: intake.cloud_folder_url || null,
                },
                ai_rationale: `${shotList.length} photos recommended. ${shotList.filter((s) => s.priority === 'high').length} high-priority.`,
                requires_client_approval: false,
              })
            }
          }
        } catch (err) {
          console.error(`[profile-optimize] AI generation failed for ${location.id}/${section.key}:`, err)
        }
      }

      // Services — check independently of audit sections
      const intakeSvcList: Array<{ name: string; description?: string }> = intake.services || []
      const existingSvcNames = profileServices.map((s) => s.toLowerCase())
      const existingSvcSet = new Set(existingSvcNames)
      const missingSvcs = intakeSvcList.filter((s) => !existingSvcSet.has(s.name.toLowerCase()))

      if (missingSvcs.length > 0) {
        try {
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
            location_id: location.id,
            batch_id: batchId,
            field: 'services',
            current_value: profileServices,
            proposed_value: { services: finalServices },
            ai_rationale: `${finalServices.length} intake services not on profile. AI-generated descriptions for each.`,
            requires_client_approval: false,
          })
        } catch (err) {
          console.error(`[profile-optimize] Service generation failed for ${location.id}:`, err)
        }
      }

      // Website UTM — check independently
      if (profile.website_uri && !profile.website_uri.includes('utm_source') && !profile.website_uri.includes('utm_medium')) {
        try {
          const parsed = new URL(profile.website_uri)
          parsed.searchParams.set('utm_source', 'google')
          parsed.searchParams.set('utm_medium', 'organic')
          parsed.searchParams.set('utm_campaign', 'gbp')
          recommendations.push({
            location_id: location.id,
            batch_id: batchId,
            field: 'website',
            current_value: profile.website_uri,
            proposed_value: parsed.toString(),
            ai_rationale: 'Website URL has no UTM tracking. Adding attribution params enables analytics.',
            requires_client_approval: false,
          })
        } catch {
          // Invalid URL — skip
        }
      }

      if (recommendations.length > 0) {
        await adminClient.from('profile_recommendations').insert(recommendations)

        await adminClient
          .from('locations')
          .update({ setup_status: 'audited' })
          .eq('id', location.id)

        generated++
        console.log(`[profile-optimize] Generated ${recommendations.length} recs for ${location.name}`)
      } else {
        skipped++
      }
    } catch (err) {
      console.error(`[profile-optimize] Error processing ${location.id}:`, err)
      skipped++
    }
  }

  console.log(`[profile-optimize] Done. Generated: ${generated}, Skipped: ${skipped}`)

  return NextResponse.json({
    processed: locations.length,
    generated,
    skipped,
  })
}
