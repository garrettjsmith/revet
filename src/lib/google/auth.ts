import { decrypt, encrypt } from '@/lib/encryption'
import { createAdminClient } from '@/lib/supabase/admin'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

export interface GoogleTokens {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope: string
  token_type: string
}

/**
 * Get a valid access token for the Google integration.
 * Refreshes automatically if expired (with 5-minute buffer).
 * If status is 'error' but refresh token exists, attempts recovery before giving up.
 */
export async function getValidAccessToken(): Promise<string> {
  const supabase = createAdminClient()

  const { data: integration, error } = await supabase
    .from('agency_integrations')
    .select('*')
    .eq('provider', 'google')
    .single()

  if (error || !integration) {
    console.error('[google/auth] No integration row found:', error?.message)
    throw new GoogleAuthError('Google integration not connected', 'not_connected')
  }

  console.log(`[google/auth] Integration found: status=${integration.status}, has_access=${!!integration.access_token_encrypted}, has_refresh=${!!integration.refresh_token_encrypted}, expires=${integration.token_expires_at}`)

  if (!integration.refresh_token_encrypted) {
    console.error('[google/auth] No refresh token stored — reconnection required')
    throw new GoogleAuthError('Google refresh token missing — reconnection required', 'reconnect_required')
  }

  // If status is 'error' but we have a refresh token, try to recover
  // (e.g., a transient failure previously set status to error)
  if (integration.status === 'error') {
    console.log('[google/auth] Status is error but refresh token exists — attempting recovery')
    try {
      return await refreshAccessToken(integration)
    } catch (err) {
      // Recovery failed — rethrow
      throw err
    }
  }

  if (!integration.access_token_encrypted) {
    // No access token but have refresh token — just refresh
    return refreshAccessToken(integration)
  }

  // Check if access token is still valid (with 5-minute buffer)
  const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at) : new Date(0)
  const bufferMs = 5 * 60 * 1000
  if (expiresAt.getTime() - Date.now() > bufferMs) {
    return decrypt(integration.access_token_encrypted)
  }

  // Refresh the token
  return refreshAccessToken(integration)
}

/**
 * Refresh the access token using the stored refresh token.
 * Retries once on transient failures before marking as error.
 */
async function refreshAccessToken(integration: any): Promise<string> {
  const supabase = createAdminClient()
  const refreshToken = decrypt(integration.refresh_token_encrypted)

  let lastError: any = null

  // Retry up to 2 times for transient failures
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000)) // 1s delay between retries
    }

    try {
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
      })

      if (response.ok) {
        const tokens: GoogleTokens = await response.json()

        // Update stored tokens and ensure status is 'connected' (auto-recovery)
        await supabase
          .from('agency_integrations')
          .update({
            status: 'connected',
            access_token_encrypted: encrypt(tokens.access_token),
            token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            metadata: {
              ...integration.metadata,
              last_refreshed_at: new Date().toISOString(),
              // Clear any previous error info on successful refresh
              error: undefined,
              error_at: undefined,
            },
          })
          .eq('id', integration.id)

        console.log('[google/auth] Token refreshed successfully')
        return tokens.access_token
      }

      const err = await response.json().catch(() => ({ error: 'unknown', error_description: response.statusText }))
      lastError = err

      if (err.error === 'invalid_grant') {
        // Refresh token is definitively revoked/expired — no point retrying
        console.error('[google/auth] invalid_grant — refresh token revoked or expired. User must reconnect.')
        console.error('[google/auth] Details:', JSON.stringify(err))

        await supabase
          .from('agency_integrations')
          .update({
            status: 'error',
            metadata: {
              ...integration.metadata,
              error: 'refresh_token_revoked',
              error_at: new Date().toISOString(),
              error_detail: `Google returned invalid_grant: ${err.error_description || 'Token has been expired or revoked'}`,
            },
          })
          .eq('id', integration.id)

        throw new GoogleAuthError(
          'Google refresh token revoked — reconnection required',
          'reconnect_required'
        )
      }

      // Non-invalid_grant error — retry
      console.warn(`[google/auth] Refresh attempt ${attempt + 1} failed: ${err.error} — ${err.error_description}`)
    } catch (err) {
      if (err instanceof GoogleAuthError) throw err // Don't retry auth errors
      lastError = err
      console.warn(`[google/auth] Refresh attempt ${attempt + 1} threw:`, err)
    }
  }

  // All retries exhausted — mark as error
  console.error('[google/auth] All refresh attempts failed:', lastError)
  await supabase
    .from('agency_integrations')
    .update({
      status: 'error',
      metadata: {
        ...integration.metadata,
        error: 'refresh_failed',
        error_at: new Date().toISOString(),
        error_detail: lastError?.error_description || lastError?.message || 'Unknown error',
      },
    })
    .eq('id', integration.id)

  throw new GoogleAuthError(
    `Google token refresh failed after retries: ${lastError?.error || 'unknown'}`,
    'reconnect_required'
  )
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google/callback`,
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const err = await response.json()
    throw new Error(`Token exchange failed: ${err.error} — ${err.error_description}`)
  }

  return response.json()
}

/**
 * Revoke a Google OAuth token.
 */
export async function revokeToken(token: string): Promise<void> {
  await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
}

/**
 * Fetch the Google user's email using the access token.
 */
export async function fetchGoogleUserInfo(accessToken: string): Promise<{ email: string; name: string }> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to fetch Google user info')
  return res.json()
}

/**
 * Check if Google integration is connected and tokens are present.
 * Does NOT attempt refresh — just checks DB state.
 */
export async function checkGoogleConnectionStatus(): Promise<{
  connected: boolean
  status: string
  email?: string
  error?: string
}> {
  const supabase = createAdminClient()
  const { data: integration } = await supabase
    .from('agency_integrations')
    .select('status, account_email, refresh_token_encrypted, metadata')
    .eq('provider', 'google')
    .single()

  if (!integration) {
    return { connected: false, status: 'not_connected' }
  }

  if (!integration.refresh_token_encrypted) {
    return { connected: false, status: 'no_tokens', email: integration.account_email }
  }

  if (integration.status === 'error') {
    const meta = integration.metadata as any
    return {
      connected: false,
      status: 'error',
      email: integration.account_email,
      error: meta?.error_detail || meta?.error || 'Connection error',
    }
  }

  return {
    connected: true,
    status: integration.status,
    email: integration.account_email,
  }
}

/**
 * Make an authenticated request to a Google API.
 * Automatically retries once with a refreshed token on 401.
 */
export async function googleFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const accessToken = await getValidAccessToken()

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  })

  // If 401, try refreshing and retry once
  if (response.status === 401) {
    const supabase = createAdminClient()
    const { data: integration } = await supabase
      .from('agency_integrations')
      .select('*')
      .eq('provider', 'google')
      .single()

    if (!integration) throw new Error('Google integration not found')

    const newToken = await refreshAccessToken(integration)
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${newToken}`,
      },
    })
  }

  return response
}

export class GoogleAuthError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'GoogleAuthError'
    this.code = code
  }
}
