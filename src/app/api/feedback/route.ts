import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, buildFeedbackEmail } from '@/lib/email'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/feedback
 *
 * Receives negative-experience feedback from the review funnel,
 * stores it as a review event, and emails the location manager.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { profile_id, session_id, rating, feedback } = body

    if (!profile_id) {
      return NextResponse.json({ error: 'Missing profile_id' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Look up the review profile to get manager email + context
    const { data: profile } = await supabase
      .from('review_profiles')
      .select('id, name, manager_email, manager_name, org_id, location_id')
      .eq('id', profile_id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Track the feedback_submitted event
    await supabase.from('review_events').insert({
      profile_id,
      event_type: 'feedback_submitted',
      session_id: session_id || null,
      rating: rating || null,
      routed_to: 'email',
      metadata: { feedback: feedback || '' },
    })

    // Send email to manager if configured
    if (profile.manager_email) {
      const html = buildFeedbackEmail({
        profileName: profile.name,
        managerName: profile.manager_name,
        rating: rating || null,
        feedback: feedback || null,
      })

      await sendEmail({
        to: profile.manager_email,
        subject: `Patient feedback – ${profile.name}`,
        html,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[feedback] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
