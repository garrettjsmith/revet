import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/encryption'
import { revokeToken } from '@/lib/google/auth'

/**
 * POST /api/integrations/google/disconnect
 *
 * Revokes the Google OAuth token and marks the integration as disconnected.
 */
export async function POST(request: NextRequest) {
  // Verify authenticated agency admin
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('org_members')
    .select('is_agency_admin')
    .eq('user_id', user.id)
    .eq('is_agency_admin', true)
    .limit(1)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const adminClient = createAdminClient()

  // Get the current integration
  const { data: integration } = await adminClient
    .from('agency_integrations')
    .select('*')
    .eq('provider', 'google')
    .single()

  if (!integration) {
    return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
  }

  // Revoke the token at Google (best-effort)
  if (integration.refresh_token_encrypted) {
    try {
      const refreshToken = decrypt(integration.refresh_token_encrypted)
      await revokeToken(refreshToken)
    } catch {
      // Token may already be revoked — continue with disconnect
    }
  }

  // Update the integration status and clear tokens
  await adminClient
    .from('agency_integrations')
    .update({
      status: 'disconnected',
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_expires_at: null,
      scopes: [],
      metadata: {
        ...integration.metadata,
        disconnected_at: new Date().toISOString(),
        disconnected_by: user.id,
      },
    })
    .eq('id', integration.id)

  // Pause all Google review sources
  await adminClient
    .from('review_sources')
    .update({ sync_status: 'paused' })
    .eq('platform', 'google')

  return NextResponse.json({ ok: true })
}
