import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCronSecret } from '@/lib/cron-auth'

export const maxDuration = 120

/**
 * GET /api/cron/citation-followup
 *
 * Daily cron that finds citations stuck in "submitted" status for 14+ days
 * and logs follow-up alerts to agent_activity_log so the agency can act.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request)
  if (authError) return authError

  const supabase = createAdminClient()

  const fourteenDaysAgo = new Date(
    Date.now() - 14 * 24 * 60 * 60 * 1000
  ).toISOString()

  const { data: staleCitations, error } = await supabase
    .from('citation_listings')
    .select('id, location_id, directory_name, status, created_at, updated_at')
    .eq('status', 'submitted')
    .lt('updated_at', fourteenDaysAgo)

  if (error) {
    console.error('[citation-followup] Query failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!staleCitations || staleCitations.length === 0) {
    return NextResponse.json({ processed: 0, locations_affected: 0 })
  }

  // Group by location
  const byLocation = new Map<string, typeof staleCitations>()
  for (const c of staleCitations) {
    const existing = byLocation.get(c.location_id) || []
    existing.push(c)
    byLocation.set(c.location_id, existing)
  }

  let logged = 0

  for (const [locationId, citations] of Array.from(byLocation.entries())) {
    const directories = citations
      .map((c) => c.directory_name)
      .join(', ')
    const oldestMs = Math.min(
      ...citations.map((c) => new Date(c.updated_at).getTime())
    )
    const oldestDays = Math.round(
      (Date.now() - oldestMs) / (1000 * 60 * 60 * 24)
    )

    const { error: insertError } = await supabase
      .from('agent_activity_log')
      .insert({
        location_id: locationId,
        action_type: 'citation_followup',
        status: 'completed',
        summary: `${citations.length} citation${citations.length > 1 ? 's' : ''} pending for ${oldestDays}+ days: ${directories}`,
        details: {
          stale_count: citations.length,
          oldest_days: oldestDays,
          directories: citations.map((c) => ({
            id: c.id,
            directory: c.directory_name,
            updated_at: c.updated_at,
          })),
        },
      })

    if (insertError) {
      console.error(
        `[citation-followup] Failed to log for location ${locationId}:`,
        insertError
      )
    } else {
      logged++
    }
  }

  return NextResponse.json({
    processed: staleCitations.length,
    locations_affected: logged,
  })
}
