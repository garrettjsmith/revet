import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { checkAgencyAdmin } from '@/lib/locations'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agency/organizations
 * Returns all organizations (for agency-level UI components).
 */
export async function GET() {
  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const supabase = createAdminClient()

  const { data: organizations } = await supabase
    .from('organizations')
    .select('id, name, slug')
    .eq('status', 'active')
    .order('name')

  return NextResponse.json({ organizations: organizations || [] })
}

/**
 * POST /api/agency/organizations
 * Creates a new organization. Agency admin only.
 */
export async function POST(request: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const { name } = await request.json()
  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name required' }, { status: 400 })
  }

  const trimmed = name.trim()
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const { data: orgId, error } = await supabase.rpc('create_organization', {
    org_name: trimmed,
    org_slug: slug,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: orgId, name: trimmed, slug })
}
