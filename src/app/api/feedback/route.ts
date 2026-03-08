import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, buildFeedbackEmail } from '@/lib/email'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 15

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW = 60_000 // 1 minute
const RATE_LIMIT_MAX = 5 // max 5 submissions per minute per IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return true
  }
  entry.count++
  return entry.count <= RATE_LIMIT_MAX
}

/**
 * POST /api/feedback
 *
 * Receives negative-experience feedback from the review funnel,
 * stores it as a review event, and emails the location manager.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

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
