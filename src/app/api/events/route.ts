import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { profile_id, event_type, session_id, rating, routed_to } = body

    if (!profile_id || !event_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const validEvents = ['page_view', 'rating_submitted', 'google_click', 'email_click']
    if (!validEvents.includes(event_type)) {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
    }

    const supabase = createAdminClient()

    await supabase.from('review_events').insert({
      profile_id,
      event_type,
      session_id: session_id || null,
      rating: rating || null,
      routed_to: routed_to || null,
      metadata: {},
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
