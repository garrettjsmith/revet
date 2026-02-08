import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/integrations/google/status
 *
 * Returns the current Google integration connection status with diagnostics.
 * Used by the setup page to check if reconnection is needed before discovery.
 */
export async function GET() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminClient = createAdminClient()
  const { data: integration, error } = await adminClient
    .from('agency_integrations')
    .select('id, status, account_email, access_token_encrypted, refresh_token_encrypted, token_expires_at, metadata, created_at, updated_at')
    .eq('provider', 'google')
    .single()

  if (error || !integration) {
    console.log('[google/status] No integration row found:', error?.message)
    return NextResponse.json({
      connected: false,
      status: 'not_connected',
      debug: { error: error?.message, code: error?.code },
    })
  }

  const hasAccess = !!integration.access_token_encrypted
  const hasRefresh = !!integration.refresh_token_encrypted
  const expiresAt = integration.token_expires_at
  const isExpired = expiresAt ? new Date(expiresAt).getTime() < Date.now() : true
  const meta = integration.metadata as Record<string, unknown> | null

  console.log(`[google/status] Integration: id=${integration.id}, status=${integration.status}, hasAccess=${hasAccess}, hasRefresh=${hasRefresh}, expired=${isExpired}, expires=${expiresAt}`)

  if (!hasRefresh) {
    return NextResponse.json({
      connected: false,
      status: 'no_refresh_token',
      email: integration.account_email,
      debug: {
        db_status: integration.status,
        has_access_token: hasAccess,
        has_refresh_token: false,
        token_expires_at: expiresAt,
        is_expired: isExpired,
        created_at: integration.created_at,
        updated_at: integration.updated_at,
        metadata_error: meta?.error,
      },
    })
  }

  if (integration.status === 'error') {
    return NextResponse.json({
      connected: false,
      status: 'error',
      email: integration.account_email,
      error: (meta?.error_detail as string) || (meta?.error as string) || 'Connection error',
      debug: {
        db_status: integration.status,
        has_access_token: hasAccess,
        has_refresh_token: hasRefresh,
        token_expires_at: expiresAt,
        is_expired: isExpired,
        error_at: meta?.error_at,
        metadata_error: meta?.error,
        metadata_detail: meta?.error_detail,
      },
    })
  }

  return NextResponse.json({
    connected: true,
    status: integration.status,
    email: integration.account_email,
    debug: {
      db_status: integration.status,
      has_access_token: hasAccess,
      has_refresh_token: hasRefresh,
      token_expires_at: expiresAt,
      is_expired: isExpired,
      last_refreshed: meta?.last_refreshed_at,
    },
  })
}
