import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createCTReport, runCTReport } from '@/lib/brightlocal'

export const maxDuration = 120

/**
 * POST /api/citations/audit
 *
 * Manually trigger a citation audit for specific locations.
 * Supports both CRON_SECRET auth and authenticated agency admin.
 *
 * Body: { location_ids?: string[] }
 *   - If location_ids provided, audit only those locations
 *   - If omitted, create new audits for all mapped locations that don't have a running audit
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
  const stats = { created: 0, triggered: 0 }

  // Get locations to audit
  let query = supabase
    .from('locations')
    .select('id, name, type, phone, address_line1, city, state, postal_code, country, brightlocal_report_id')
    .eq('active', true)

  if (locationIds && locationIds.length > 0) {
    query = query.in('id', locationIds)
  }

  const { data: locations } = await query.limit(50)

  if (!locations || locations.length === 0) {
    return NextResponse.json({ error: 'No matching locations found' }, { status: 404 })
  }

  const errors: string[] = []

  for (const loc of locations) {
    try {
      // If no BrightLocal report yet, create one
      if (!loc.brightlocal_report_id) {
        const isSAB = loc.type === 'service_area'

        // SABs need phone + city/state; physical locations also need address
        if (!loc.phone || !loc.city || !loc.state) {
          errors.push(`${loc.name}: missing phone, city, or state`)
          continue
        }
        if (!isSAB && !loc.address_line1) {
          errors.push(`${loc.name}: missing address`)
          continue
        }

        const reportId = await createCTReport({
          reportName: `${loc.name} - Citation Audit`,
          businessName: loc.name,
          phone: loc.phone,
          address: loc.address_line1 || '',
          city: loc.city,
          state: loc.state,
          postcode: loc.postal_code || '',
          country: loc.country === 'US' ? 'USA' : loc.country,
        })

        await supabase
          .from('locations')
          .update({ brightlocal_report_id: reportId })
          .eq('id', loc.id)

        loc.brightlocal_report_id = reportId
        stats.created++
      }

      // Create audit record and trigger
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

      await runCTReport(loc.brightlocal_report_id)

      await supabase
        .from('citation_audits')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', audit.id)

      stats.triggered++
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error'
      console.error(`[citation-audit] Failed for location ${loc.id}:`, err)
      errors.push(`${loc.name}: ${msg}`)
    }
  }

  // If nothing was triggered, return an error response
  if (stats.triggered === 0) {
    return NextResponse.json(
      { error: 'No audits triggered', errors, ...stats },
      { status: 422 }
    )
  }

  return NextResponse.json({ ok: true, errors, ...stats })
}
