import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAgencyAdmin } from '@/lib/locations'

/**
 * GET /api/orgs/[orgId]/brand-config
 * Returns the brand config for an org.
 *
 * PUT /api/orgs/[orgId]/brand-config
 * Upserts brand config. Agency admin only.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { orgId: string } }
) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify membership
  const { data: member } = await supabase
    .from('org_members')
    .select('id')
    .eq('org_id', params.orgId)
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const adminClient = createAdminClient()
  const { data: config } = await adminClient
    .from('brand_config')
    .select('*')
    .eq('org_id', params.orgId)
    .single()

  return NextResponse.json({ config: config || null })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { orgId: string } }
) {
  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const body = await request.json()
  const { brand_voice, design_style, primary_color, secondary_color, font_style, sample_image_urls } = body

  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('brand_config')
    .upsert(
      {
        org_id: params.orgId,
        brand_voice: brand_voice || null,
        design_style: design_style || null,
        primary_color: primary_color || null,
        secondary_color: secondary_color || null,
        font_style: font_style || null,
        sample_image_urls: sample_image_urls || [],
      },
      { onConflict: 'org_id' }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
