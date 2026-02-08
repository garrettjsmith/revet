import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { setupNotificationsForAllAccounts, getNotificationSettings } from '@/lib/google/pubsub'
import { listGBPAccounts } from '@/lib/google/accounts'
import { getValidAccessToken, GoogleAuthError } from '@/lib/google/auth'

/**
 * POST /api/integrations/google/notifications
 *
 * Sets up Pub/Sub notifications for all accessible GBP accounts.
 * Call after OAuth connect to enable real-time review notifications.
 */
export async function POST(request: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify agency admin
  const adminClient = createAdminClient()
  const { data: member } = await adminClient
    .from('org_members')
    .select('is_agency_admin')
    .eq('user_id', user.id)
    .eq('is_agency_admin', true)
    .limit(1)
    .single()

  if (!member) {
    return NextResponse.json({ error: 'Agency admin access required' }, { status: 403 })
  }

  try {
    await getValidAccessToken()
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      return NextResponse.json({ error: 'Google connection required' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Google auth error' }, { status: 500 })
  }

  if (!process.env.GOOGLE_PUBSUB_TOPIC) {
    return NextResponse.json(
      { error: 'GOOGLE_PUBSUB_TOPIC not configured' },
      { status: 500 }
    )
  }

  try {
    const results = await setupNotificationsForAllAccounts()
    const succeeded = results.filter((r) => r.ok).length
    const failed = results.filter((r) => !r.ok)

    return NextResponse.json({
      ok: true,
      accounts_configured: succeeded,
      accounts_failed: failed.length,
      results,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * GET /api/integrations/google/notifications
 *
 * Returns current notification settings for all accounts.
 */
export async function GET(request: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await getValidAccessToken()
  } catch {
    return NextResponse.json({ error: 'Google not connected' }, { status: 401 })
  }

  try {
    const accounts = await listGBPAccounts()
    const settings: Array<{ accountId: string; accountName: string; setting?: any; error?: string }> = []

    for (const account of accounts) {
      const accountId = account.name.replace('accounts/', '')
      try {
        const setting = await getNotificationSettings(accountId)
        settings.push({ accountId, accountName: account.accountName, setting })
      } catch (err) {
        settings.push({
          accountId,
          accountName: account.accountName,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    return NextResponse.json({ ok: true, settings })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
