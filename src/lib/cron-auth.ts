import { NextRequest, NextResponse } from 'next/server'

/**
 * Verify CRON_SECRET bearer token on cron/internal routes.
 * Returns null if authorized, or a 401 NextResponse if not.
 *
 * Unlike the old pattern `if (apiKey && ...)`, this REJECTS
 * requests when CRON_SECRET is not configured — preventing
 * open access when the env var is missing.
 */
export function verifyCronSecret(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get('authorization')
  const apiKey = process.env.CRON_SECRET

  if (!apiKey) {
    console.error('[cron-auth] CRON_SECRET not configured — rejecting request')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
