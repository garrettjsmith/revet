import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const STATIC_ACTIONS = [
  { id: 'bulk-edit', label: 'Bulk Edit Profiles', path: '/agency/locations', description: 'Edit GBP profiles across locations', keywords: 'bulk edit profile description phone update' },
  { id: 'sync-reviews', label: 'Sync Reviews', path: '/agency', description: 'View review sync status', keywords: 'sync reviews google health' },
  { id: 'integrations', label: 'Google Integration', path: '/agency/integrations', description: 'Manage Google connection', keywords: 'integration google connect oauth' },
  { id: 'notifications', label: 'Notification Settings', path: '/agency/notifications', description: 'Configure alerts and digests', keywords: 'notifications alerts digest email' },
  { id: 'organizations', label: 'Organizations', path: '/agency/organizations', description: 'Manage organizations', keywords: 'org organization manage' },
  { id: 'landers', label: 'Local Landers', path: '/agency/landers', description: 'Manage local landing pages', keywords: 'lander landing page local seo' },
]

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ locations: [], organizations: [], actions: [] })
  }

  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if agency admin
  const { data: adminCheck } = await supabase
    .from('org_members')
    .select('is_agency_admin')
    .eq('user_id', user.id)
    .eq('is_agency_admin', true)
    .limit(1)

  const isAgencyAdmin = adminCheck && adminCheck.length > 0

  const searchPattern = `%${q}%`

  if (isAgencyAdmin) {
    // Agency admin: search all orgs and locations
    const adminClient = createAdminClient()

    const [{ data: locations }, { data: organizations }] = await Promise.all([
      adminClient
        .from('locations')
        .select('id, name, city, state, org_id, organizations(name, slug)')
        .or(`name.ilike.${searchPattern},city.ilike.${searchPattern}`)
        .limit(5),
      adminClient
        .from('organizations')
        .select('id, name, slug')
        .ilike('name', searchPattern)
        .limit(5),
    ])

    const locationResults = (locations || []).map((loc: any) => ({
      id: loc.id,
      name: loc.name,
      city: loc.city,
      state: loc.state,
      orgSlug: loc.organizations?.slug,
      orgName: loc.organizations?.name,
    }))

    const orgResults = (organizations || []).map((org: any) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
    }))

    // Filter static actions
    const qLower = q.toLowerCase()
    const actionResults = STATIC_ACTIONS.filter(
      (a) => a.label.toLowerCase().includes(qLower) || a.keywords.includes(qLower)
    )

    return NextResponse.json({
      locations: locationResults,
      organizations: orgResults,
      actions: actionResults,
    })
  } else {
    // Org member: search within their orgs only
    const { data: memberships } = await supabase
      .from('org_members')
      .select('org_id, organizations(name, slug)')
      .eq('user_id', user.id)

    const orgIds = (memberships || []).map((m: any) => m.org_id)
    if (orgIds.length === 0) {
      return NextResponse.json({ locations: [], organizations: [], actions: [] })
    }

    const [{ data: locations }, { data: organizations }] = await Promise.all([
      supabase
        .from('locations')
        .select('id, name, city, state, org_id, organizations(name, slug)')
        .in('org_id', orgIds)
        .or(`name.ilike.${searchPattern},city.ilike.${searchPattern}`)
        .limit(5),
      supabase
        .from('organizations')
        .select('id, name, slug')
        .in('id', orgIds)
        .ilike('name', searchPattern)
        .limit(5),
    ])

    const locationResults = (locations || []).map((loc: any) => ({
      id: loc.id,
      name: loc.name,
      city: loc.city,
      state: loc.state,
      orgSlug: loc.organizations?.slug,
      orgName: loc.organizations?.name,
    }))

    const orgResults = (organizations || []).map((org: any) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
    }))

    return NextResponse.json({
      locations: locationResults,
      organizations: orgResults,
      actions: [],
    })
  }
}
