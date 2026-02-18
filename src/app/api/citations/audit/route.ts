import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findBLLocation, createBLLocation, findExistingCTReport, createCTReport, runCTReport, searchBusinessCategory } from '@/lib/brightlocal'
import { pullAuditResults } from '@/lib/citation-sync'

export const maxDuration = 120

/**
 * POST /api/citations/audit
 *
 * Trigger a citation audit for specific locations, or pull results for
 * audits that are already running/completed in BrightLocal.
 *
 * Body: { location_ids?: string[] }
 *   - If location_ids provided, audit only those locations
 *   - If omitted, process all active locations
 */
export async function POST(request: NextRequest) {
  // Auth: CRON_SECRET or agency admin
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    // Cron auth — proceed
  } else {
    const { createServerSupabase } = await import('@/lib/supabase/server')
    const supabase = createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminClient = createAdminClient()
    const { data: admin } = await adminClient
      .from('org_members')
      .select('is_agency_admin')
      .eq('user_id', user.id)
      .eq('is_agency_admin', true)
      .limit(1)
      .single()

    if (!admin) {
      return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
    }
  }

  if (!process.env.BRIGHTLOCAL_API_KEY) {
    return NextResponse.json({ error: 'BrightLocal not configured' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const locationIds: string[] | undefined = body.location_ids
  const supabase = createAdminClient()
  const stats = { created: 0, triggered: 0, pulled: 0 }

  // Get locations to audit
  let query = supabase
    .from('locations')
    .select('id, name, type, phone, address_line1, city, state, postal_code, country, brightlocal_location_id, brightlocal_report_id')
    .eq('active', true)

  if (locationIds && locationIds.length > 0) {
    query = query.in('id', locationIds)
  }

  const { data: locations } = await query.limit(50)

  if (!locations || locations.length === 0) {
    return NextResponse.json({ error: 'No matching locations found' }, { status: 404 })
  }

  // Pre-fetch GBP profiles for business category + website
  const locIds = locations.map((l) => l.id)
  const { data: gbpProfiles } = await supabase
    .from('gbp_profiles')
    .select('location_id, primary_category_name, website_uri')
    .in('location_id', locIds)

  const gbpByLocation = new Map(
    (gbpProfiles || []).map((p) => [p.location_id, p])
  )

  // Pre-fetch existing running audits so we can pull results instead of creating duplicates
  const { data: existingAudits } = await supabase
    .from('citation_audits')
    .select('id, location_id, brightlocal_report_id, status')
    .in('location_id', locIds)
    .in('status', ['running', 'pending'])

  const runningAuditByLocation = new Map(
    (existingAudits || []).map((a) => [a.location_id, a])
  )

  const errors: string[] = []

  for (const loc of locations) {
    try {
      // If there's already a running audit, try to pull results
      const existingAudit = runningAuditByLocation.get(loc.id)
      if (existingAudit && existingAudit.status === 'running') {
        try {
          const pulled = await pullAuditResults(supabase, existingAudit)
          if (pulled) {
            stats.pulled++
          } else {
            errors.push(`${loc.name}: BL report still running, check back later`)
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'unknown error'
          errors.push(`${loc.name}: failed to pull results — ${msg}`)
        }
        continue
      }

      // Step 1: Ensure BrightLocal Location exists
      if (!loc.brightlocal_location_id) {
        const gbp = gbpByLocation.get(loc.id)

        if (!loc.phone || !loc.city || !loc.state) {
          errors.push(`${loc.name}: missing phone, city, or state`)
          continue
        }

        // Check if location already exists in BL by reference
        let blLocId = await findBLLocation(loc.id)

        if (!blLocId) {
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

        loc.brightlocal_location_id = blLocId
      }

      // Step 2: Ensure CT report exists
      if (!loc.brightlocal_report_id) {
        // Check if a CT report already exists for this BL location
        let reportId = await findExistingCTReport(loc.brightlocal_location_id)

        if (!reportId) {
          const gbp = gbpByLocation.get(loc.id)
          const businessType = gbp?.primary_category_name || 'Business'
          const primaryLocation = loc.postal_code || loc.city || ''

          if (!primaryLocation) {
            errors.push(`${loc.name}: missing postal code or city for competitor lookup`)
            continue
          }

          reportId = await createCTReport({
            locationId: loc.brightlocal_location_id,
            businessType,
            primaryLocation,
          })
        }

        await supabase
          .from('locations')
          .update({ brightlocal_report_id: reportId })
          .eq('id', loc.id)

        loc.brightlocal_report_id = reportId
        stats.created++
      }

      // Step 3: Create audit record and trigger scan
      // Skip if there's already a pending audit for this location
      if (existingAudit && existingAudit.status === 'pending') {
        // Try to run the pending audit
        const runResult = await runCTReport(existingAudit.brightlocal_report_id)

        if (runResult === 'already_running') {
          errors.push(`${loc.name}: another CT scan is already running, audit queued`)
        } else {
          await supabase
            .from('citation_audits')
            .update({ status: 'running', started_at: new Date().toISOString() })
            .eq('id', existingAudit.id)
        }

        stats.triggered++
        continue
      }

      const { data: audit, error: insertError } = await supabase
        .from('citation_audits')
        .insert({
          location_id: loc.id,
          brightlocal_report_id: loc.brightlocal_report_id,
          status: 'pending',
        })
        .select('id')
        .single()

      if (insertError || !audit) {
        errors.push(`${loc.name}: failed to create audit record — ${insertError?.message || 'unknown'}`)
        continue
      }

      const runResult = await runCTReport(loc.brightlocal_report_id)

      if (runResult === 'already_running') {
        errors.push(`${loc.name}: another CT scan is already running, audit queued`)
        stats.triggered++
      } else {
        await supabase
          .from('citation_audits')
          .update({ status: 'running', started_at: new Date().toISOString() })
          .eq('id', audit.id)

        stats.triggered++
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error'
      console.error(`[citation-audit] Failed for location ${loc.id}:`, err)
      errors.push(`${loc.name}: ${msg}`)
    }
  }

  if (stats.triggered === 0 && stats.pulled === 0) {
    return NextResponse.json(
      { error: 'No audits triggered or pulled', errors, ...stats },
      { status: 422 }
    )
  }

  return NextResponse.json({ ok: true, errors, ...stats })
}
