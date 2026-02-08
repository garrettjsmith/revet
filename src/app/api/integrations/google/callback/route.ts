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

    console.log(`[google/callback] Token exchange success: has_access=${!!tokens.access_token}, has_refresh=${!!tokens.refresh_token}, expires_in=${tokens.expires_in}s, scope=${tokens.scope}`)

    // Get the connected account's email
    const userInfo = await fetchGoogleUserInfo(tokens.access_token)
    console.log(`[google/callback] User info: ${userInfo.email}`)

    // Store encrypted tokens
    const supabase = createAdminClient()

    // Build the upsert payload — always include refresh token if present
    const upsertData: Record<string, unknown> = {
      provider: 'google',
      account_email: userInfo.email,
      status: 'connected',
      access_token_encrypted: encrypt(tokens.access_token),
      token_expires_at: new Date(
        Date.now() + tokens.expires_in * 1000
      ).toISOString(),
      scopes: tokens.scope.split(' '),
      metadata: {
        account_name: userInfo.name,
        connected_at: new Date().toISOString(),
      },
    }

    // Only include refresh_token if Google returned one
    // (with prompt=consent it always should, but be safe)
    if (tokens.refresh_token) {
      upsertData.refresh_token_encrypted = encrypt(tokens.refresh_token)
    }

    const { error: upsertError } = await supabase
      .from('agency_integrations')
      .upsert(upsertData, { onConflict: 'provider' })

    if (upsertError) {
      console.error('[google/callback] Upsert failed:', upsertError.message, upsertError.details, upsertError.hint)
      return NextResponse.redirect(
        `${APP_URL}/agency/integrations?error=save_failed&detail=${encodeURIComponent(upsertError.message)}`
      )
    }

    // Verify the upsert actually stored the tokens
    const { data: verify } = await supabase
      .from('agency_integrations')
      .select('id, status, access_token_encrypted, refresh_token_encrypted, token_expires_at')
      .eq('provider', 'google')
      .single()

    console.log(`[google/callback] Verified stored: id=${verify?.id}, status=${verify?.status}, has_access=${!!verify?.access_token_encrypted}, has_refresh=${!!verify?.refresh_token_encrypted}, expires=${verify?.token_expires_at}`)

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
