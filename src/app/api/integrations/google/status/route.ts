import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { checkGoogleConnectionStatus } from '@/lib/google/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/integrations/google/status
 *
 * Returns the current Google integration connection status.
 * Used by the setup page to check if reconnection is needed before discovery.
 */
export async function GET() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const status = await checkGoogleConnectionStatus()
  return NextResponse.json(status)
}
