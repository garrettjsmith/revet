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
 * Throws if integration not found or refresh token revoked.
 */
export async function getValidAccessToken(): Promise<string> {
  const supabase = createAdminClient()

  const { data: integration, error } = await supabase
    .from('agency_integrations')
    .select('*')
    .eq('provider', 'google')
    .single()

  if (error || !integration) {
    throw new Error('Google integration not connected')
  }

  if (integration.status === 'error') {
    throw new GoogleAuthError('Google integration requires reconnection', 'reconnect_required')
  }

  if (!integration.access_token_encrypted || !integration.refresh_token_encrypted) {
    throw new GoogleAuthError('Google tokens not found', 'reconnect_required')
  }

  // Check if access token is still valid (with 5-minute buffer)
  const expiresAt = new Date(integration.token_expires_at)
  const bufferMs = 5 * 60 * 1000
  if (expiresAt.getTime() - Date.now() > bufferMs) {
    return decrypt(integration.access_token_encrypted)
  }

  // Refresh the token
  return refreshAccessToken(integration)
}

/**
 * Refresh the access token using the stored refresh token.
 */
async function refreshAccessToken(integration: any): Promise<string> {
  const supabase = createAdminClient()
  const refreshToken = decrypt(integration.refresh_token_encrypted)

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

  if (!response.ok) {
    const err = await response.json()

    if (err.error === 'invalid_grant') {
      // Refresh token has been revoked or expired
      await supabase
        .from('agency_integrations')
        .update({
          status: 'error',
          metadata: {
            ...integration.metadata,
            error: 'refresh_token_revoked',
            error_at: new Date().toISOString(),
          },
        })
        .eq('id', integration.id)

      throw new GoogleAuthError(
        'Google refresh token revoked — reconnection required',
        'reconnect_required'
      )
    }

    throw new Error(`Google token refresh failed: ${err.error} — ${err.error_description}`)
  }

  const tokens: GoogleTokens = await response.json()

  // Update stored tokens
  await supabase
    .from('agency_integrations')
    .update({
      access_token_encrypted: encrypt(tokens.access_token),
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    })
    .eq('id', integration.id)

  return tokens.access_token
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
