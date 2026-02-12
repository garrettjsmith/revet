import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, buildQueueDigestEmail } from '@/lib/email'

export const maxDuration = 60

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.revet.app'

interface QueueCounts {
  reviewCount: number
  draftCount: number
  googleUpdateCount: number
  postCount: number
  syncErrorCount: number
  totalItems: number
}

/**
 * Count queue items, optionally scoped to a set of location IDs.
 */
async function countQueueItems(
  supabase: ReturnType<typeof createAdminClient>,
  locationIds: string[] | null
): Promise<QueueCounts> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function scope(query: any) {
    if (locationIds) return query.in('location_id', locationIds)
    return query
  }

  const [negativeResult, aiDraftResult, googleResult, postResult, reviewSyncResult, profileSyncResult] = await Promise.all([
    scope(
      supabase
        .from('reviews')
        .select('id', { count: 'exact', head: true })
        .eq('platform', 'google')
        .eq('status', 'new')
        .eq('sentiment', 'negative')
        .is('reply_body', null)
    ),
    scope(
      supabase
        .from('reviews')
        .select('id', { count: 'exact', head: true })
        .not('ai_draft', 'is', null)
        .is('reply_body', null)
        .neq('status', 'archived')
    ),
    scope(
      supabase
        .from('gbp_profiles')
        .select('location_id', { count: 'exact', head: true })
        .eq('has_google_updated', true)
    ),
    scope(
      supabase
        .from('gbp_post_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
    ),
    scope(
      supabase
        .from('review_sources')
        .select('id', { count: 'exact', head: true })
        .eq('sync_status', 'error')
    ),
    scope(
      supabase
        .from('gbp_profiles')
        .select('location_id', { count: 'exact', head: true })
        .eq('sync_status', 'error')
    ),
  ])

  const reviewCount = negativeResult.count || 0
  const draftCount = aiDraftResult.count || 0
  const googleUpdateCount = googleResult.count || 0
  const postCount = postResult.count || 0
  const syncErrorCount = (reviewSyncResult.count || 0) + (profileSyncResult.count || 0)
  const totalItems = reviewCount + draftCount + googleUpdateCount + postCount + syncErrorCount

  return { reviewCount, draftCount, googleUpdateCount, postCount, syncErrorCount, totalItems }
}

/**
 * GET /api/cron/queue-digest
 *
 * Daily cron that sends work queue summary emails.
 *
 * - Agency admins receive a global digest (all items across all orgs)
 * - Account managers receive a scoped digest (only items from their assigned orgs)
 *
 * Schedule: Daily at 13:00 UTC (8am ET / 5am PT)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const apiKey = process.env.REVIEW_SYNC_API_KEY

  if (apiKey && authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // 1. Get agency admins
  const { data: agencyAdmins } = await supabase
    .from('org_members')
    .select('user_id')
    .eq('is_agency_admin', true)

  const adminUserIds = new Set(
    (agencyAdmins || []).map((a) => a.user_id)
  )

  // 2. Get account managers and their org assignments
  const { data: managerRows } = await supabase
    .from('org_account_managers')
    .select('user_id, org_id')

  // Group org IDs by manager user_id
  const managerOrgMap = new Map<string, string[]>()
  for (const row of managerRows || []) {
    // Skip if this user is also an agency admin (they get the global digest)
    if (adminUserIds.has(row.user_id)) continue
    if (!managerOrgMap.has(row.user_id)) {
      managerOrgMap.set(row.user_id, [])
    }
    managerOrgMap.get(row.user_id)!.push(row.org_id)
  }

  // Collect all unique user IDs (admins + non-admin managers)
  const allUserIds = Array.from(new Set(
    Array.from(adminUserIds).concat(Array.from(managerOrgMap.keys()))
  ))

  if (allUserIds.length === 0) {
    return NextResponse.json({ ok: true, message: 'No recipients', sent: 0 })
  }

  // 3. Resolve emails for all recipients
  const userEmails = new Map<string, { email: string; name: string | null }>()
  for (const uid of allUserIds) {
    const { data } = await supabase.auth.admin.getUserById(uid)
    if (data?.user?.email) {
      userEmails.set(uid, {
        email: data.user.email,
        name: data.user.email.split('@')[0],
      })
    }
  }

  if (userEmails.size === 0) {
    return NextResponse.json({ ok: true, message: 'No recipient emails', sent: 0 })
  }

  // 4. Compute global counts (for agency admins)
  const globalCounts = await countQueueItems(supabase, null)

  // 5. Compute per-manager location IDs (for scoped digests)
  const managerLocationMap = new Map<string, string[]>()
  const allManagedOrgIds = Array.from(new Set(
    Array.from(managerOrgMap.values()).flat()
  ))

  if (allManagedOrgIds.length > 0) {
    const { data: locations } = await supabase
      .from('locations')
      .select('id, org_id')
      .in('org_id', allManagedOrgIds)
      .eq('active', true)

    // Build org_id -> location_ids lookup
    const orgLocationMap = new Map<string, string[]>()
    for (const loc of locations || []) {
      if (!orgLocationMap.has(loc.org_id)) {
        orgLocationMap.set(loc.org_id, [])
      }
      orgLocationMap.get(loc.org_id)!.push(loc.id)
    }

    // Map each manager to their location IDs
    Array.from(managerOrgMap.entries()).forEach(([userId, orgIds]) => {
      const locIds: string[] = []
      for (const orgId of orgIds) {
        locIds.push(...(orgLocationMap.get(orgId) || []))
      }
      if (locIds.length > 0) {
        managerLocationMap.set(userId, locIds)
      }
    })
  }

  // 6. Send digests
  let sent = 0

  // Send to agency admins (global counts)
  if (globalCounts.totalItems > 0) {
    Array.from(adminUserIds).forEach((uid) => {
      const recipient = userEmails.get(uid)
      if (!recipient) return

      const html = buildQueueDigestEmail({
        recipientName: recipient.name,
        ...globalCounts,
        queueUrl: `${APP_URL}/agency/queue`,
      })

      sendEmail({
        to: recipient.email,
        subject: `Work queue: ${globalCounts.totalItems} item${globalCounts.totalItems === 1 ? '' : 's'} need attention`,
        html,
      }).catch((err) => {
        console.error(`[queue-digest] Email failed for ${recipient.email}:`, err)
      })

      sent++
    })
  }

  // Send to account managers (scoped counts)
  const managerEntries = Array.from(managerLocationMap.entries())
  for (const [userId, locationIds] of managerEntries) {
    const recipient = userEmails.get(userId)
    if (!recipient) continue

    const counts = await countQueueItems(supabase, locationIds)
    if (counts.totalItems === 0) continue

    const html = buildQueueDigestEmail({
      recipientName: recipient.name,
      ...counts,
      queueUrl: `${APP_URL}/agency/queue`,
    })

    sendEmail({
      to: recipient.email,
      subject: `Your queue: ${counts.totalItems} item${counts.totalItems === 1 ? '' : 's'} need attention`,
      html,
    }).catch((err) => {
      console.error(`[queue-digest] Email failed for ${recipient.email}:`, err)
    })

    sent++
  }

  return NextResponse.json({
    ok: true,
    global_items: globalCounts.totalItems,
    admin_recipients: adminUserIds.size,
    manager_recipients: managerLocationMap.size,
    total_sent: sent,
  })
}
