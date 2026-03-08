import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runAgentForLocation, type AgentConfig, DEFAULT_PROFILE_SKILLS } from '@/lib/agent'
import { tiersWithFeature } from '@/lib/tiers'
import { verifyCronSecret } from '@/lib/cron-auth'

export const maxDuration = 300

/**
 * GET/POST /api/cron/agent-loop
 *
 * Daily agent loop. For each location with agent enabled:
 * 1. Audit the profile
 * 2. Generate + apply/queue optimizations based on trust level
 * 3. Auto-apply pending recommendations (if trust = 'auto')
 * 4. Log all actions to agent_activity_log
 *
 * Existing crons handle the rest:
 * - Review replies: /api/cron/ai-drafts + /api/cron/reply-queue
 * - Post generation: /api/cron/post-generate + /api/cron/post-queue
 * - Data sync: /api/google/reviews/sync, profiles/sync, etc.
 */
export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request)
  if (authError) return authError

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 500 })
  }

  const adminClient = createAdminClient()
  const eligibleTiers = tiersWithFeature('profile_optimization')

  // Find all locations with agent enabled
  const { data: configs } = await adminClient
    .from('location_agent_config')
    .select('*')
    .eq('enabled', true)

  // Also find locations on eligible tiers that DON'T have config yet
  // (default behavior: agent enabled with 'queue' trust for everything)
  const configuredIds = (configs || []).map((c: any) => c.location_id)

  const { data: unconfiguredLocations } = await adminClient
    .from('locations')
    .select('id')
    .in('service_tier', eligibleTiers)
    .eq('active', true)

  // Skip locations that haven't completed intake — the agent needs
  // business context (services, keywords, brand voice) to produce
  // useful recommendations.
  const allLocationIds = [
    ...configuredIds,
    ...(unconfiguredLocations || []).map((l: any) => l.id),
  ]
  const { data: readyLocations } = await adminClient
    .from('locations')
    .select('id')
    .in('id', allLocationIds)
    .not('intake_completed_at', 'is', null)

  const readyIds = new Set((readyLocations || []).map((l: any) => l.id))

  // Merge: configured + unconfigured with defaults, filtered to intake-complete
  const allConfigs: AgentConfig[] = [
    ...(configs || [])
      .filter((c: any) => readyIds.has(c.location_id))
      .map((c: any) => ({
        location_id: c.location_id,
        enabled: c.enabled,
        review_replies: c.review_replies || 'queue',
        post_publishing: c.post_publishing || 'queue',
        auto_reply_min_rating: c.auto_reply_min_rating ?? 4,
        auto_reply_max_rating: c.auto_reply_max_rating ?? 5,
        escalate_below_rating: c.escalate_below_rating ?? 3,
        tone: c.tone || 'professional and friendly',
        business_context: c.business_context,
        profile_skills: c.profile_skills ?? DEFAULT_PROFILE_SKILLS,
      })),
    // Unconfigured eligible locations get default config (queue everything)
    ...(unconfiguredLocations || [])
      .filter((l: any) => !configuredIds.includes(l.id) && readyIds.has(l.id))
      .map((l: any) => ({
        location_id: l.id,
        enabled: true,
        review_replies: 'queue' as const,
        post_publishing: 'queue' as const,
        auto_reply_min_rating: 4,
        auto_reply_max_rating: 5,
        escalate_below_rating: 3,
        tone: 'professional and friendly',
        business_context: null,
        profile_skills: DEFAULT_PROFILE_SKILLS,
      })),
  ]

  const results: Array<{
    location_id: string
    location_name: string
    actions_taken: number
    audit_score: number | null
    error?: string
  }> = []

  // Process locations sequentially to avoid rate limits
  for (const config of allConfigs) {
    try {
      const result = await runAgentForLocation(config.location_id, config)
      results.push({
        location_id: result.location_id,
        location_name: result.location_name,
        actions_taken: result.actions.length,
        audit_score: result.audit_score,
        error: result.error,
      })
    } catch (err) {
      results.push({
        location_id: config.location_id,
        location_name: '',
        actions_taken: 0,
        audit_score: null,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  const totalActions = results.reduce((sum, r) => sum + r.actions_taken, 0)

  return NextResponse.json({
    ok: true,
    locations_processed: results.length,
    total_actions: totalActions,
    results,
  })
}

// Vercel cron sends GET
export const GET = POST
