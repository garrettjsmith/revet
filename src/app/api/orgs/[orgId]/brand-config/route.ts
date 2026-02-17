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
  const { primary_color, secondary_color, voice_selections, style_selections } = body

  // Compose brand_voice string from selections
  const voiceParts: string[] = []
  if (voice_selections?.personality) voiceParts.push(voice_selections.personality)
  if (voice_selections?.tone?.length) voiceParts.push(...voice_selections.tone)
  if (voice_selections?.formality) voiceParts.push(voice_selections.formality)
  const brand_voice = voiceParts.length > 0 ? voiceParts.join(', ') : null

  // Compose design_style string from selections
  const styleParts: string[] = []
  if (style_selections?.aesthetic) styleParts.push(style_selections.aesthetic)
  if (style_selections?.color_mood) styleParts.push(style_selections.color_mood)
  if (style_selections?.typography) styleParts.push(style_selections.typography)
  const design_style = styleParts.length > 0 ? styleParts.join(', ') : null

  // Determine font_style from typography selection
  const fontStyleMap: Record<string, string> = {
    'Classic & Serif': 'serif',
    'Modern & Sans-Serif': 'sans-serif',
    'Handwritten & Casual': 'handwritten',
    'Bold & Heavy': 'bold',
  }
  const font_style = style_selections?.typography
    ? fontStyleMap[style_selections.typography] || null
    : null

  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('brand_config')
    .upsert(
      {
        org_id: params.orgId,
        brand_voice,
        design_style,
        primary_color: primary_color || null,
        secondary_color: secondary_color || null,
        font_style,
        voice_selections: voice_selections || {},
        style_selections: style_selections || {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id' }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
