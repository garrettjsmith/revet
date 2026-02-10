import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = createServerSupabase()

  // Verify authenticated user is agency admin
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

  const body = await request.json()
  const {
    org_id, location_id, slug, heading, description,
    primary_color, logo_url, custom_about,
    show_reviews, show_map, show_faq, active,
  } = body

  if (!org_id || !location_id || !slug) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('local_landers')
    .insert({
      org_id,
      location_id,
      slug,
      heading,
      description,
      primary_color: primary_color || '#1B4965',
      logo_url,
      custom_about,
      show_reviews: show_reviews ?? true,
      show_map: show_map ?? true,
      show_faq: show_faq ?? true,
      active: active ?? true,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A lander with that slug already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function PUT(request: NextRequest) {
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

  const body = await request.json()
  const {
    id, slug, heading, description,
    primary_color, logo_url, custom_about,
    show_reviews, show_map, show_faq, active,
  } = body

  if (!id) {
    return NextResponse.json({ error: 'Missing lander ID' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('local_landers')
    .update({
      slug,
      heading,
      description,
      primary_color,
      logo_url,
      custom_about,
      show_reviews,
      show_map,
      show_faq,
      active,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A lander with that slug already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
