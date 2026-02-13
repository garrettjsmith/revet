import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { auditGBPProfile, type AuditResult } from '@/lib/ai/profile-audit'
import { generateProfileDescription, suggestCategories } from '@/lib/ai/profile-optimize'
import type { GBPProfile } from '@/lib/types'
import { randomUUID } from 'crypto'

export const maxDuration = 300

/**
 * Monthly cron: Audit all active locations and generate
 * optimization recommendations where scores have dropped or
 * improvement opportunities exist.
 *
 * Runs on the 15th of each month at 10:00 UTC.
 * Only runs for standard/premium tier locations.
 */
export async function GET() {
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

      // Find actionable sections
      const actionableSections = audit.sections.filter(
        (s) => s.status !== 'good' && s.suggestion && (s.key === 'description' || s.key === 'categories')
      )

      if (actionableSections.length === 0) {
        skipped++
        continue
      }

      // Fetch corrections for AI context
      const { data: corrections } = await adminClient
        .from('ai_corrections')
        .select('field, original_text, corrected_text')
        .eq('org_id', location.org_id)
        .order('created_at', { ascending: false })
        .limit(10)

      // Fetch brand config
      const { data: brandConfig } = await adminClient
        .from('brand_config')
        .select('brand_voice')
        .eq('org_id', location.org_id)
        .single()

      const brandVoice = brandConfig?.brand_voice || null

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
            const services = (profile.service_items || [])
              .map((s: Record<string, unknown>) => s.displayName || s.name || '')
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
              location_id: location.id,
              batch_id: batchId,
              field: 'description',
              current_value: profile.description || null,
              proposed_value: proposed,
              ai_rationale: section.suggestion!,
              requires_client_approval: true,
            })
          } else if (section.key === 'categories') {
            const services = (profile.service_items || [])
              .map((s: Record<string, unknown>) => s.displayName || s.name || '')
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
                location_id: location.id,
                batch_id: batchId,
                field: 'categories',
                current_value: currentCategories,
                proposed_value: suggested,
                ai_rationale: section.suggestion!,
                requires_client_approval: false,
              })
            }
          }
        } catch (err) {
          console.error(`[profile-optimize] AI generation failed for ${location.id}/${section.key}:`, err)
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
