import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt } from '@/lib/encryption'
import { exchangeCodeForTokens, fetchGoogleUserInfo } from '@/lib/google/auth'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!

/**
 * GET /api/integrations/google/callback
 *
 * Google redirects here after user consents (or denies).
 * Exchanges the authorization code for tokens, encrypts them,
 * and stores them in agency_integrations.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  // Handle user denial
  if (error === 'access_denied') {
    return NextResponse.redirect(
      `${APP_URL}/agency/integrations?error=access_denied`
    )
  }

  if (error) {
    return NextResponse.redirect(
      `${APP_URL}/agency/integrations?error=${encodeURIComponent(error)}`
    )
  }

  // Validate state against cookie (CSRF protection)
  const storedState = request.cookies.get('google_oauth_state')?.value
  if (!state || !storedState || state !== storedState) {
    return NextResponse.redirect(
      `${APP_URL}/agency/integrations?error=invalid_state`
    )
  }

  if (!code) {
    return NextResponse.redirect(
      `${APP_URL}/agency/integrations?error=no_code`
    )
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code)

    // Get the connected account's email
    const userInfo = await fetchGoogleUserInfo(tokens.access_token)

    // Store encrypted tokens
    const supabase = createAdminClient()

    const { error: upsertError } = await supabase
      .from('agency_integrations')
      .upsert(
        {
          provider: 'google',
          account_email: userInfo.email,
          status: 'connected',
          access_token_encrypted: encrypt(tokens.access_token),
          refresh_token_encrypted: tokens.refresh_token
            ? encrypt(tokens.refresh_token)
            : undefined,
          token_expires_at: new Date(
            Date.now() + tokens.expires_in * 1000
          ).toISOString(),
          scopes: tokens.scope.split(' '),
          metadata: {
            account_name: userInfo.name,
            connected_at: new Date().toISOString(),
          },
        },
        { onConflict: 'provider' }
      )

    if (upsertError) {
      console.error('[google/callback] Upsert failed:', upsertError)
      return NextResponse.redirect(
        `${APP_URL}/agency/integrations?error=save_failed`
      )
    }

    // Clean up state cookie and redirect to setup wizard
    const response = NextResponse.redirect(
      `${APP_URL}/agency/integrations/google/setup`
    )
    response.cookies.delete('google_oauth_state')
    return response
  } catch (err) {
    console.error('[google/callback] Error:', err)
    return NextResponse.redirect(
      `${APP_URL}/agency/integrations?error=token_exchange_failed`
    )
  }
}
