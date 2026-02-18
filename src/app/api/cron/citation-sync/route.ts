import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  findBLLocation,
  createBLLocation,
  findExistingCTReport,
  createCTReport,
  runCTReport,
  createCBCampaign,
  searchBusinessCategory,
} from '@/lib/brightlocal'
import { pullAuditResults } from '@/lib/citation-sync'

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
 * Runs every 15 minutes via Vercel cron.
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

  // ─── Phase 2: Trigger next pending audit ─────────────────
  // BL only allows one CT scan at a time. If something is already running,
  // skip entirely — don't waste API calls getting "already_running" errors.
  try {
    const { count: runningCount } = await supabase
      .from('citation_audits')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'running')

    if (!runningCount || runningCount === 0) {
      const { data: nextAudit } = await supabase
        .from('citation_audits')
        .select('id, brightlocal_report_id, location_id')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

      if (nextAudit) {
        try {
          const runResult = await runCTReport(nextAudit.brightlocal_report_id)

          if (runResult !== 'already_running') {
            await supabase
              .from('citation_audits')
              .update({ status: 'running', started_at: new Date().toISOString() })
              .eq('id', nextAudit.id)

            stats.triggered++
          }
        } catch (err) {
          console.error(`[citation-sync] Failed to trigger audit ${nextAudit.id}:`, err)
          await supabase
            .from('citation_audits')
            .update({
              status: 'failed',
              last_error: err instanceof Error ? err.message : 'Unknown error',
            })
            .eq('id', nextAudit.id)
          stats.errors++
        }
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
        const pulled = await pullAuditResults(supabase, audit)
        if (pulled) stats.pulled++
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


