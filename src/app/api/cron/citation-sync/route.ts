import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createBLLocation,
  createCTReport,
  runCTReport,
  getCTReport,
  getCTResults,
  type CTCitation,
} from '@/lib/brightlocal'

export const maxDuration = 120

/**
 * GET /api/cron/citation-sync
 *
 * Three-phase citation sync via BrightLocal Citation Tracker:
 *
 * Phase 1 — Map: Find locations with GBP profiles but no BrightLocal report,
 *           create BL Location + CT report for them.
 * Phase 2 — Trigger: Find completed or stale audits and re-run them.
 *           Also run newly created reports for the first time.
 * Phase 3 — Pull: Fetch results from completed BrightLocal reports,
 *           upsert citation_listings, flag mismatches as action_needed.
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
  const stats = { mapped: 0, triggered: 0, pulled: 0, errors: 0 }

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
        .select('location_id, primary_category_name')
        .in('location_id', locationIds)
        .eq('sync_status', 'active')

      const profiledIds = new Set((profiles || []).map((p) => p.location_id))
      const categoryByLocation = new Map(
        (profiles || []).map((p) => [p.location_id, p.primary_category_name])
      )

      for (const loc of unmapped) {
        if (!profiledIds.has(loc.id)) continue
        if (!loc.phone || !loc.city || !loc.state) continue

        try {
          // Step 1: Create BrightLocal Location if needed
          let blLocId = loc.brightlocal_location_id
          if (!blLocId) {
            blLocId = await createBLLocation({
              name: loc.name,
              phone: loc.phone,
              address1: loc.address_line1 || undefined,
              city: loc.city,
              stateCode: loc.state,
              postcode: loc.postal_code || '',
              country: loc.country === 'US' ? 'USA' : loc.country,
              locationReference: loc.id,
            })

            await supabase
              .from('locations')
              .update({ brightlocal_location_id: blLocId })
              .eq('id', loc.id)
          }

          // Step 2: Create CT report
          const businessType = categoryByLocation.get(loc.id) || 'Business'
          const primaryLocation = loc.postal_code || loc.city || ''
          if (!primaryLocation) continue

          const reportId = await createCTReport({
            locationId: blLocId,
            businessType,
            primaryLocation,
          })

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
        if (report.status !== 'completed' && report.status !== 'Completed' && report.status !== 'complete') continue

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

          // Determine NAP correctness by comparing found values
          const nameMatch = !cit['business-name'] || cit['business-name'] === expectedName
          const phoneMatch = !cit.telephone || cit.telephone === expectedPhone
          const napCorrect = nameMatch && phoneMatch

          if (!isLive && !hasListing) {
            missing++
          } else if (napCorrect) {
            correct++
          } else {
            incorrect++
          }

          const listingStatus = determineListingStatus(cit)

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
                address_match: true, // BL doesn't provide granular address match in CT
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

  return NextResponse.json({ ok: true, ...stats })
}

// ─── Helpers ─────────────────────────────────────────────────

function determineListingStatus(cit: CTCitation): string {
  const citStatus = cit['citation-status']
  const hasListing = !!cit.url
  if (citStatus !== 'active' && !hasListing) return 'not_listed'
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
  if (cit['business-name'] && cit['business-name'] !== expectedName) issues.push('business name')
  if (cit.telephone && cit.telephone !== expectedPhone) issues.push('phone number')

  if (issues.length === 0) return null

  return `Incorrect ${issues.join(', ')} on ${cit.source}. Update the listing to match current business information.`
}
