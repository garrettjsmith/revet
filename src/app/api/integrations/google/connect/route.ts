import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import crypto from 'crypto'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'

/**
 * GET /api/integrations/google/connect
 *
 * Initiates the Google OAuth flow. Verifies the user is an agency admin,
 * generates a CSRF state parameter, and redirects to Google's consent screen.
 */
export async function GET(request: NextRequest) {
  // Verify authenticated agency admin
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(
      new URL('/admin/login', process.env.NEXT_PUBLIC_APP_URL!)
    )
  }

  const { data: membership } = await supabase
    .from('org_members')
    .select('is_agency_admin')
    .eq('user_id', user.id)
    .eq('is_agency_admin', true)
    .limit(1)
    .single()

  if (!membership) {
    return NextResponse.redirect(
      new URL('/admin?error=unauthorized', process.env.NEXT_PUBLIC_APP_URL!)
    )
  }

  // Generate CSRF state
  const state = crypto.randomUUID()

  // Build authorization URL
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google/callback`,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/business.manage openid email profile',
    access_type: 'offline',
    prompt: 'consent',
    state,
    include_granted_scopes: 'true',
  })

  const response = NextResponse.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`)

  // Store state in HttpOnly cookie for validation in callback
  response.cookies.set('google_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 minutes
  })

  return response
}
