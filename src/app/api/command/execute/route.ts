import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  // Auth: agency admin only
  const supabase = createServerSupabase()
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

  const { intent, params } = await req.json()
  if (!intent) {
    return NextResponse.json({ error: 'Intent is required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  switch (intent) {
    case 'search_locations': {
      let query = adminClient
        .from('locations')
        .select('id, name, city, state, org_id, organizations(name, slug)')

      if (params.query) {
        query = query.ilike('name', `%${params.query}%`)
      }
      if (params.city) {
        query = query.ilike('city', `%${params.city}%`)
      }
      if (params.state) {
        query = query.ilike('state', `%${params.state}%`)
      }

      // Filter by org name if specified
      let orgIds: string[] | null = null
      if (params.org_name) {
        const { data: orgs } = await adminClient
          .from('organizations')
          .select('id')
          .ilike('name', `%${params.org_name}%`)
        orgIds = (orgs || []).map((o: any) => o.id)
        if (orgIds.length > 0) {
          query = query.in('org_id', orgIds)
        } else {
          return NextResponse.json({ locations: [] })
        }
      }

      const { data: locations } = await query.limit(20)

      const results = (locations || []).map((loc: any) => ({
        id: loc.id,
        name: loc.name,
        city: loc.city,
        state: loc.state,
        orgSlug: loc.organizations?.slug,
        orgName: loc.organizations?.name,
      }))

      return NextResponse.json({ locations: results })
    }

    case 'navigate': {
      return NextResponse.json({ path: params.path || '/agency' })
    }

    case 'show_action_items': {
      // Delegate to the action-items API
      const baseUrl = req.nextUrl.origin
      const res = await fetch(`${baseUrl}/api/agency/action-items`, {
        headers: { cookie: req.headers.get('cookie') || '' },
      })
      const data = await res.json()
      return NextResponse.json(data)
    }

    case 'bulk_update_profiles': {
      const filter = params.location_filter as Record<string, string> | undefined
      const fields = params.fields as Record<string, string> | undefined

      if (!filter || !fields || Object.keys(fields).length === 0) {
        return NextResponse.json({ error: 'Filter and fields are required' }, { status: 400 })
      }

      // Resolve locations matching the filter
      let locQuery = adminClient.from('locations').select('id')

      if (filter.city) {
        locQuery = locQuery.ilike('city', `%${filter.city}%`)
      }
      if (filter.state) {
        locQuery = locQuery.ilike('state', `%${filter.state}%`)
      }
      if (filter.org_name) {
        const { data: orgs } = await adminClient
          .from('organizations')
          .select('id')
          .ilike('name', `%${filter.org_name}%`)
        const orgIds = (orgs || []).map((o: any) => o.id)
        if (orgIds.length > 0) {
          locQuery = locQuery.in('org_id', orgIds)
        } else {
          return NextResponse.json({ updated: 0, message: 'No matching organizations found' })
        }
      }

      const { data: locations } = await locQuery
      const locationIds = (locations || []).map((l: any) => l.id)

      if (locationIds.length === 0) {
        return NextResponse.json({ updated: 0, message: 'No matching locations found' })
      }

      // Build update object with only the fields specified
      const updateFields: Record<string, string> = {}
      if (fields.description !== undefined) updateFields.description = fields.description
      if (fields.phone_primary !== undefined) updateFields.phone_primary = fields.phone_primary
      if (fields.website_uri !== undefined) updateFields.website_uri = fields.website_uri

      // Update GBP profiles for all matching locations
      const { error } = await adminClient
        .from('gbp_profiles')
        .update(updateFields)
        .in('location_id', locationIds)

      if (error) {
        return NextResponse.json({ error: 'Update failed: ' + error.message }, { status: 500 })
      }

      return NextResponse.json({
        updated: locationIds.length,
        message: `Updated ${locationIds.length} location${locationIds.length === 1 ? '' : 's'}`,
      })
    }

    default:
      return NextResponse.json({ error: `Unknown intent: ${intent}` }, { status: 400 })
  }
}
