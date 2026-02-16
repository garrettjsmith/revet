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
    throw new GoogleAuthError('Google integration not connected', 'not_connected')
  }

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
        console.error('[google/auth] Refresh token revoked (invalid_grant). User must reconnect.')
        console.error('[google/auth] This commonly happens when the Google Cloud app is in "Testing" mode (7-day token expiry).')

        await supabase
          .from('agency_integrations')
          .update({
            status: 'error',
            metadata: {
              ...integration.metadata,
              error: 'refresh_token_revoked',
              error_at: new Date().toISOString(),
              error_detail: 'Google returned invalid_grant. If your app is in Testing mode, publish it to Production in Google Cloud Console to get long-lived tokens.',
            },
          })
          .eq('id', integration.id)

        throw new GoogleAuthError(
          'Google refresh token expired — reconnection required. If your Google Cloud app is in "Testing" mode, publish it to get long-lived tokens.',
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

/** HTTP status codes that indicate a transient error worth retrying. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])

/**
 * Make an authenticated request to a Google API.
 * Retries on 401 (with token refresh) and on transient errors (429, 5xx)
 * with exponential backoff (1s, 2s, 4s).
 */
export async function googleFetch(url: string, options: RequestInit = {}): Promise<Response> {
  let accessToken = await getValidAccessToken()
  const maxRetries = 3

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    })

    // 401 — refresh token and retry once
    if (response.status === 401 && attempt === 0) {
      const supabase = createAdminClient()
      const { data: integration } = await supabase
        .from('agency_integrations')
        .select('*')
        .eq('provider', 'google')
        .single()

      if (!integration) throw new Error('Google integration not found')

      accessToken = await refreshAccessToken(integration)
      continue
    }

    // Transient error — retry with exponential backoff
    if (RETRYABLE_STATUSES.has(response.status) && attempt < maxRetries) {
      const delayMs = 1000 * Math.pow(2, attempt) // 1s, 2s, 4s
      console.warn(`[google/fetch] ${response.status} on attempt ${attempt + 1}, retrying in ${delayMs}ms: ${url}`)
      await new Promise((r) => setTimeout(r, delayMs))
      continue
    }

    return response
  }

  // Should not reach here, but satisfy TypeScript
  throw new Error(`[google/fetch] Exhausted retries for ${url}`)
}

export class GoogleAuthError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'GoogleAuthError'
    this.code = code
  }
}
