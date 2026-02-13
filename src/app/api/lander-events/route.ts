import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

const VALID_EVENTS = ['page_view', 'phone_click', 'directions_click', 'website_click']

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { lander_id, location_id, event_type, session_id } = body

    if (!lander_id || !location_id || !event_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!VALID_EVENTS.includes(event_type)) {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
    }

    const supabase = createAdminClient()

    await supabase.from('lander_events').insert({
      lander_id,
      location_id,
      event_type,
      session_id: session_id || null,
      metadata: {},
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
