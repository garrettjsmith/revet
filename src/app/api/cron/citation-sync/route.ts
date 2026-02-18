import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  findBLLocation,
  createBLLocation,
  findExistingCTReport,
  createCTReport,
  runCTReport,
  getCTReport,
  getCTResults,
  createCBCampaign,
  searchBusinessCategory,
  type CTCitation,
} from '@/lib/brightlocal'

export const maxDuration = 120

/**
 * GET /api/cron/citation-sync
 *
 * Four-phase citation sync via BrightLocal:
 *
 * Phase 1 — Map: Find locations with GBP profiles but no BrightLocal report,
 *           create BL Location (Management API) + CT report for them.
 * Phase 2 — Trigger: Run pending CT report audits.
 * Phase 3 — Pull: Fetch results from completed reports,
 *           upsert citation_listings, flag mismatches as action_needed.
 * Phase 4 — Build: For locations with completed audits but no Citation Builder
 *           campaign, create a CB campaign so missing citations can be submitted.
 *
 * Runs daily at 6 AM via Vercel cron.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const apiKey = process.env.CRON_SECRET

  if (apiKey && authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.BRIGHTLOCAL_API_KEY) {
    return NextResponse.json({ error: 'BrightLocal not configured' }, { status: 200 })
  }

  const supabase = createAdminClient()
  const stats = { mapped: 0, triggered: 0, pulled: 0, campaigns: 0, errors: 0 }

  // ─── Phase 1: Map new locations to BrightLocal ─────────────
  try {
    const { data: unmapped } = await supabase
      .from('locations')
      .select('id, name, type, phone, address_line1, city, state, postal_code, country, brightlocal_location_id')
      .eq('active', true)
      .is('brightlocal_report_id', null)
      .limit(10)

    // Only map locations that have a synced GBP profile (i.e., real businesses)
    if (unmapped && unmapped.length > 0) {
      const locationIds = unmapped.map((l) => l.id)
      const { data: profiles } = await supabase
        .from('gbp_profiles')
        .select('location_id, primary_category_name, website_uri')
        .in('location_id', locationIds)
        .eq('sync_status', 'active')

      const profiledIds = new Set((profiles || []).map((p) => p.location_id))
      const gbpByLocation = new Map(
        (profiles || []).map((p) => [p.location_id, p])
      )

      for (const loc of unmapped) {
        if (!profiledIds.has(loc.id)) continue
        if (!loc.phone || !loc.city || !loc.state) continue

        try {
          // Step 1: Find or create BrightLocal Location
          let blLocId = loc.brightlocal_location_id
          if (!blLocId) {
            // Check if location already exists in BL by reference
            blLocId = await findBLLocation(loc.id)

            if (!blLocId) {
              const gbp = gbpByLocation.get(loc.id)
              const website = gbp?.website_uri || loc.name.toLowerCase().replace(/\s+/g, '') + '.com'
              const categoryName = gbp?.primary_category_name || 'Business'
              const blCountry = loc.country === 'US' ? 'USA' : loc.country
              const categoryId = await searchBusinessCategory(categoryName, blCountry) || '605'

              blLocId = await createBLLocation({
                name: loc.name,
                phone: loc.phone,
                address1: loc.address_line1 || undefined,
                city: loc.city,
                region: loc.state,
                postcode: loc.postal_code || '',
                country: blCountry,
                website,
                businessCategoryId: categoryId,
                locationReference: loc.id,
              })
            }

            await supabase
              .from('locations')
              .update({ brightlocal_location_id: blLocId })
              .eq('id', loc.id)
          }

          // Step 2: Find or create CT report
          let reportId = await findExistingCTReport(blLocId)

          if (!reportId) {
            const gbp = gbpByLocation.get(loc.id)
            const businessType = gbp?.primary_category_name || 'Business'
            const primaryLocation = loc.postal_code || loc.city || ''
            if (!primaryLocation) continue

            reportId = await createCTReport({
              locationId: blLocId,
              businessType,
              primaryLocation,
            })
          }

          await supabase
            .from('locations')
            .update({ brightlocal_report_id: reportId })
            .eq('id', loc.id)

          // Create initial audit record
          await supabase.from('citation_audits').insert({
            location_id: loc.id,
            brightlocal_report_id: reportId,
            status: 'pending',
          })

          stats.mapped++
        } catch (err) {
          console.error(`[citation-sync] Failed to map location ${loc.id}:`, err)
          stats.errors++
        }
      }
    }
  } catch (err) {
    console.error('[citation-sync] Phase 1 (map) failed:', err)
    stats.errors++
  }

  // ─── Phase 2: Trigger pending audits ───────────────────────
  try {
    const { data: pendingAudits } = await supabase
      .from('citation_audits')
      .select('id, brightlocal_report_id, location_id')
      .eq('status', 'pending')
      .limit(10)

    for (const audit of pendingAudits || []) {
      try {
        await runCTReport(audit.brightlocal_report_id)

        await supabase
          .from('citation_audits')
          .update({ status: 'running', started_at: new Date().toISOString() })
          .eq('id', audit.id)

        stats.triggered++
      } catch (err) {
        console.error(`[citation-sync] Failed to trigger audit ${audit.id}:`, err)
        await supabase
          .from('citation_audits')
          .update({
            status: 'failed',
            last_error: err instanceof Error ? err.message : 'Unknown error',
          })
          .eq('id', audit.id)
        stats.errors++
      }
    }
  } catch (err) {
    console.error('[citation-sync] Phase 2 (trigger) failed:', err)
    stats.errors++
  }

  // ─── Phase 3: Pull results from running audits ─────────────
  try {
    const { data: runningAudits } = await supabase
      .from('citation_audits')
      .select('id, brightlocal_report_id, location_id')
      .eq('status', 'running')
      .limit(10)

    for (const audit of runningAudits || []) {
      try {
        // Check if report is done
        const report = await getCTReport(audit.brightlocal_report_id)
        if (report.status.toLowerCase() !== 'complete' && report.status.toLowerCase() !== 'completed') continue

        // Pull results
        const citations = await getCTResults(audit.brightlocal_report_id)

        // Get location's expected NAP for comparison
        const { data: location } = await supabase
          .from('locations')
          .select('name, phone, address_line1, city, state, postal_code')
          .eq('id', audit.location_id)
          .single()

        const expectedName = location?.name || ''
        const expectedAddress = [location?.address_line1, location?.city, location?.state, location?.postal_code]
          .filter(Boolean)
          .join(', ')
        const expectedPhone = location?.phone || ''

        let correct = 0
        let incorrect = 0
        let missing = 0

        for (const cit of citations) {
          const citStatus = cit['citation-status']
          const isLive = citStatus === 'active'
          const hasListing = !!cit.url

          // Determine NAP correctness by comparing found values (normalized)
          const nameMatch = !cit['business-name'] || normalizeText(cit['business-name']) === normalizeText(expectedName)
          const phoneMatch = !cit.telephone || normalizePhone(cit.telephone) === normalizePhone(expectedPhone)
          const addressMatch = !cit.address || normalizeText(cit.address) === normalizeText(expectedAddress)
          const napCorrect = nameMatch && phoneMatch && addressMatch

          if (!isLive && !hasListing) {
            missing++
          } else if (napCorrect) {
            correct++
          } else {
            incorrect++
          }

          const listingStatus = determineListingStatus(cit, napCorrect)

          await supabase
            .from('citation_listings')
            .upsert(
              {
                location_id: audit.location_id,
                audit_id: audit.id,
                directory_name: cit.source,
                directory_url: null,
                listing_url: cit.url,
                expected_name: expectedName,
                expected_address: expectedAddress,
                expected_phone: expectedPhone,
                found_name: cit['business-name'],
                found_address: cit.address,
                found_phone: cit.telephone,
                nap_correct: napCorrect,
                name_match: nameMatch,
                address_match: addressMatch,
                phone_match: phoneMatch,
                status: listingStatus,
                ai_recommendation: buildRecommendation(cit, isLive || hasListing, expectedName, expectedPhone),
                last_checked_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'location_id,directory_name' }
            )
        }

        // Update audit summary
        await supabase
          .from('citation_audits')
          .update({
            status: 'completed',
            total_found: citations.length,
            total_correct: correct,
            total_incorrect: incorrect,
            total_missing: missing,
            completed_at: new Date().toISOString(),
          })
          .eq('id', audit.id)

        stats.pulled++
      } catch (err) {
        console.error(`[citation-sync] Failed to pull audit ${audit.id}:`, err)
        await supabase
          .from('citation_audits')
          .update({
            status: 'failed',
            last_error: err instanceof Error ? err.message : 'Unknown error',
          })
          .eq('id', audit.id)
        stats.errors++
      }
    }
  } catch (err) {
    console.error('[citation-sync] Phase 3 (pull) failed:', err)
    stats.errors++
  }

  // ─── Phase 4: Create Citation Builder campaigns ────────────
  try {
    // Find locations that have a completed audit + BL location but no CB campaign
    const { data: needsCB } = await supabase
      .from('locations')
      .select('id, brightlocal_location_id')
      .eq('active', true)
      .not('brightlocal_location_id', 'is', null)
      .is('brightlocal_campaign_id', null)
      .limit(5)

    for (const loc of needsCB || []) {
      // Only create campaign if there's at least one completed audit
      const { count } = await supabase
        .from('citation_audits')
        .select('id', { count: 'exact', head: true })
        .eq('location_id', loc.id)
        .eq('status', 'completed')

      if (!count || count === 0) continue

      try {
        const campaignId = await createCBCampaign(loc.brightlocal_location_id)

        await supabase
          .from('locations')
          .update({ brightlocal_campaign_id: campaignId })
          .eq('id', loc.id)

        // Store campaign record
        await supabase.from('citation_builder_campaigns').insert({
          location_id: loc.id,
          brightlocal_campaign_id: campaignId,
          brightlocal_location_id: loc.brightlocal_location_id,
          status: 'lookup',
        })

        stats.campaigns++
      } catch (err) {
        console.error(`[citation-sync] Failed to create CB campaign for ${loc.id}:`, err)
        stats.errors++
      }
    }
  } catch (err) {
    console.error('[citation-sync] Phase 4 (build) failed:', err)
    stats.errors++
  }

  return NextResponse.json({ ok: true, ...stats })
}

// ─── Helpers ─────────────────────────────────────────────────

/** Strip non-digits for phone comparison: "(555) 123-4567" → "5551234567" */
function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  // Strip leading country code "1" if 11 digits
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return digits
}

/** Lowercase, collapse whitespace, strip punctuation for name/address comparison */
function normalizeText(text: string | null | undefined): string {
  if (!text) return ''
  return text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
}

function determineListingStatus(cit: CTCitation, napCorrect: boolean): string {
  const citStatus = cit['citation-status']
  const hasListing = !!cit.url
  if (citStatus !== 'active' && !hasListing) return 'not_listed'
  if (!napCorrect) return 'action_needed'
  return 'found'
}

function buildRecommendation(
  cit: CTCitation,
  isLive: boolean,
  expectedName: string,
  expectedPhone: string,
): string | null {
  if (!isLive) {
    return `Not listed on ${cit.source}. Submit business listing to improve citation coverage.`
  }

  const issues: string[] = []
  if (cit['business-name'] && normalizeText(cit['business-name']) !== normalizeText(expectedName)) issues.push('business name')
  if (cit.telephone && normalizePhone(cit.telephone) !== normalizePhone(expectedPhone)) issues.push('phone number')

  if (issues.length === 0) return null

  return `Incorrect ${issues.join(', ')} on ${cit.source}. Update the listing to match current business information.`
}
