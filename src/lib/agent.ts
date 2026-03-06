import { createAdminClient } from '@/lib/supabase/admin'
import { getValidAccessToken } from '@/lib/google/auth'
import { auditGBPProfile, type AuditResult } from '@/lib/ai/profile-audit'
import { generateProfileDescription } from '@/lib/ai/profile-optimize'
import { updateGBPProfile, fetchGBPProfile, normalizeGBPProfile, type GBPProfileRaw } from '@/lib/google/profiles'
import type { GBPProfile, ServiceTier } from '@/lib/types'
import { tierIncludes } from '@/lib/tiers'

export interface AgentConfig {
  location_id: string
  enabled: boolean
  review_replies: 'auto' | 'queue' | 'off'
  profile_updates: 'auto' | 'queue' | 'off'
  post_publishing: 'auto' | 'queue' | 'off'
  auto_reply_min_rating: number
  auto_reply_max_rating: number
  escalate_below_rating: number
  tone: string
  business_context: string | null
}

export interface AgentRunResult {
  location_id: string
  location_name: string
  actions: AgentAction[]
  audit_score: number | null
  error?: string
}

interface AgentAction {
  type: string
  status: 'completed' | 'queued' | 'failed' | 'escalated'
  summary: string
  details?: Record<string, unknown>
}

/**
 * Run the autonomous agent loop for a single location.
 * Observe → Decide → Act → Log
 */
export async function runAgentForLocation(
  locationId: string,
  config: AgentConfig
): Promise<AgentRunResult> {
  const adminClient = createAdminClient()
  const actions: AgentAction[] = []

  // Fetch location context
  const { data: location } = await adminClient
    .from('locations')
    .select('name, city, state, service_tier, org_id')
    .eq('id', locationId)
    .single()

  if (!location) {
    return { location_id: locationId, location_name: '', actions: [], audit_score: null, error: 'Location not found' }
  }

  const tier = location.service_tier as ServiceTier
  const result: AgentRunResult = {
    location_id: locationId,
    location_name: location.name,
    actions,
    audit_score: null,
  }

  // ─── OBSERVE: Run profile audit ───────────────────────────
  let audit: AuditResult | null = null

  if (tierIncludes(tier, 'profile_optimization')) {
    const { data: profile } = await adminClient
      .from('gbp_profiles')
      .select('*')
      .eq('location_id', locationId)
      .single()

    if (profile) {
      const { count: mediaCount } = await adminClient
        .from('gbp_media')
        .select('id', { count: 'exact', head: true })
        .eq('location_id', locationId)

      const { count: reviewCount } = await adminClient
        .from('reviews')
        .select('id', { count: 'exact', head: true })
        .eq('source_id', locationId)

      const { data: repliedReviews } = await adminClient
        .from('reviews')
        .select('id', { head: true })
        .not('reply_body', 'is', null)

      const { count: postCount } = await adminClient
        .from('gbp_posts')
        .select('id', { count: 'exact', head: true })
        .eq('location_id', locationId)

      audit = auditGBPProfile({
        profile: profile as GBPProfile,
        mediaCount: mediaCount || 0,
        reviewCount: reviewCount || 0,
        responseRate: reviewCount && reviewCount > 0
          ? (repliedReviews?.length || 0) / reviewCount
          : 0,
        postCount: postCount || 0,
      })

      result.audit_score = audit.score

      // Save audit to history
      await adminClient.from('audit_history').insert({
        location_id: locationId,
        score: audit.score,
        sections: audit.sections,
      })

      actions.push({
        type: 'audit_completed',
        status: 'completed',
        summary: `Profile audit: ${audit.score}/100`,
        details: { score: audit.score, sections: audit.sections.map((s) => ({ key: s.key, status: s.status })) },
      })
    }
  }

  // ─── DECIDE + ACT: Profile updates ────────────────────────
  if (config.profile_updates !== 'off' && audit && tierIncludes(tier, 'profile_optimization')) {
    const actionableSections = audit.sections.filter((s) => s.status !== 'good' && s.suggestion)

    for (const section of actionableSections) {
      if (section.key === 'description') {
        await handleDescriptionOptimization(
          adminClient, locationId, location, config, actions
        )
      }
      // Other section types (categories, photos, etc.) get queued as recommendations
    }
  }

  // ─── DECIDE + ACT: Auto-apply pending recommendations ─────
  if (config.profile_updates === 'auto' && tierIncludes(tier, 'profile_optimization')) {
    await autoApplyPendingRecs(adminClient, locationId, actions)
  }

  // ─── DECIDE + ACT: Post publishing ─────────────────────────
  if (config.post_publishing === 'auto' && tierIncludes(tier, 'profile_optimization')) {
    await promoteDraftPosts(adminClient, locationId, actions)
  }

  // ─── LOG: Write activity log ──────────────────────────────
  if (actions.length > 0) {
    const logRows = actions.map((a) => ({
      location_id: locationId,
      action_type: a.type,
      status: a.status,
      summary: a.summary,
      details: a.details || {},
    }))

    await adminClient.from('agent_activity_log').insert(logRows)
  }

  return result
}

/**
 * Handle description optimization: generate + auto-apply or queue.
 */
async function handleDescriptionOptimization(
  adminClient: ReturnType<typeof createAdminClient>,
  locationId: string,
  location: { name: string; city: string | null; state: string | null },
  config: AgentConfig,
  actions: AgentAction[]
) {
  // Check if there's already a pending description recommendation
  const { data: existingRec } = await adminClient
    .from('profile_recommendations')
    .select('id')
    .eq('location_id', locationId)
    .eq('field', 'description')
    .in('status', ['pending', 'approved', 'client_review'])
    .single()

  if (existingRec) return // Already has a pending rec

  const { data: profile } = await adminClient
    .from('gbp_profiles')
    .select('business_name, primary_category_name, description, service_items, gbp_location_name')
    .eq('location_id', locationId)
    .single()

  if (!profile) return

  const services = ((profile as any).service_items || [])
    .map((s: any) => s.structuredServiceItem?.description || s.freeFormServiceItem?.label?.displayName || '')
    .filter(Boolean)

  try {
    const newDescription = await generateProfileDescription({
      businessName: profile.business_name || location.name,
      category: (profile as any).primary_category_name,
      city: location.city,
      state: location.state,
      services,
      currentDescription: (profile as any).description,
    })

    if (config.profile_updates === 'auto') {
      // Auto-apply: write to Google directly
      try {
        await getValidAccessToken()
        await updateGBPProfile(
          (profile as any).gbp_location_name,
          { profile: { description: newDescription } } as Partial<GBPProfileRaw>,
          'profile.description'
        )

        // Re-fetch and update local DB
        const raw = await fetchGBPProfile((profile as any).gbp_location_name)
        const normalized = normalizeGBPProfile(raw)
        await adminClient
          .from('gbp_profiles')
          .update({
            ...normalized,
            last_pushed_at: new Date().toISOString(),
            last_synced_at: new Date().toISOString(),
          })
          .eq('location_id', locationId)

        // Save as applied recommendation for audit trail
        await adminClient.from('profile_recommendations').insert({
          location_id: locationId,
          field: 'description',
          current_value: (profile as any).description,
          proposed_value: newDescription,
          status: 'applied',
          applied_at: new Date().toISOString(),
          requires_client_approval: false,
        })

        actions.push({
          type: 'recommendation_applied',
          status: 'completed',
          summary: `Auto-updated profile description`,
          details: { field: 'description', old_length: ((profile as any).description || '').length, new_length: newDescription.length },
        })
      } catch (err) {
        actions.push({
          type: 'profile_update',
          status: 'failed',
          summary: `Failed to auto-update description: ${err instanceof Error ? err.message : 'Unknown error'}`,
        })
      }
    } else {
      // Queue: create recommendation for human approval
      await adminClient.from('profile_recommendations').insert({
        location_id: locationId,
        field: 'description',
        current_value: (profile as any).description,
        proposed_value: newDescription,
        status: 'pending',
        requires_client_approval: false,
      })

      actions.push({
        type: 'recommendation_queued',
        status: 'queued',
        summary: `Generated description recommendation (queued for approval)`,
        details: { field: 'description' },
      })
    }
  } catch (err) {
    actions.push({
      type: 'profile_update',
      status: 'failed',
      summary: `Failed to generate description: ${err instanceof Error ? err.message : 'Unknown error'}`,
    })
  }
}

/**
 * Auto-apply any pending profile recommendations that don't require client approval.
 */
async function autoApplyPendingRecs(
  adminClient: ReturnType<typeof createAdminClient>,
  locationId: string,
  actions: AgentAction[]
) {
  const { data: pendingRecs } = await adminClient
    .from('profile_recommendations')
    .select('*')
    .eq('location_id', locationId)
    .eq('status', 'pending')
    .eq('requires_client_approval', false)

  if (!pendingRecs || pendingRecs.length === 0) return

  let hasToken = false
  try {
    await getValidAccessToken()
    hasToken = true
  } catch {
    // Can't apply without Google token
  }

  if (!hasToken) return

  const { data: profile } = await adminClient
    .from('gbp_profiles')
    .select('gbp_location_name')
    .eq('location_id', locationId)
    .single()

  if (!profile) return

  for (const rec of pendingRecs) {
    try {
      const value = rec.proposed_value
      const fields: Partial<GBPProfileRaw> = {}
      const updateMaskParts: string[] = []

      if (rec.field === 'description') {
        fields.profile = { description: value as string }
        updateMaskParts.push('profile.description')
      } else if (rec.field === 'hours') {
        // Informational only — mark as applied
        await adminClient
          .from('profile_recommendations')
          .update({ status: 'applied', applied_at: new Date().toISOString() })
          .eq('id', rec.id)
        actions.push({
          type: 'recommendation_applied',
          status: 'completed',
          summary: `Marked hours recommendation as applied (informational)`,
        })
        continue
      }

      if (updateMaskParts.length > 0) {
        await updateGBPProfile(
          (profile as any).gbp_location_name,
          fields,
          updateMaskParts.join(',')
        )

        // Re-fetch profile
        const raw = await fetchGBPProfile((profile as any).gbp_location_name)
        const normalized = normalizeGBPProfile(raw)
        await adminClient
          .from('gbp_profiles')
          .update({ ...normalized, last_pushed_at: new Date().toISOString(), last_synced_at: new Date().toISOString() })
          .eq('location_id', locationId)
      }

      await adminClient
        .from('profile_recommendations')
        .update({ status: 'applied', applied_at: new Date().toISOString() })
        .eq('id', rec.id)

      actions.push({
        type: 'recommendation_applied',
        status: 'completed',
        summary: `Auto-applied ${rec.field} recommendation`,
        details: { field: rec.field, rec_id: rec.id },
      })
    } catch (err) {
      actions.push({
        type: 'recommendation_applied',
        status: 'failed',
        summary: `Failed to apply ${rec.field}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        details: { rec_id: rec.id },
      })
    }
  }
}

/**
 * Promote draft posts to pending so the post-queue cron publishes them.
 * Only runs when post_publishing = 'auto'.
 */
async function promoteDraftPosts(
  adminClient: ReturnType<typeof createAdminClient>,
  locationId: string,
  actions: AgentAction[]
) {
  const { data: drafts } = await adminClient
    .from('gbp_post_queue')
    .select('id, topic')
    .eq('location_id', locationId)
    .eq('status', 'draft')
    .not('scheduled_for', 'is', null)

  if (!drafts || drafts.length === 0) return

  const { error } = await adminClient
    .from('gbp_post_queue')
    .update({ status: 'pending' })
    .eq('location_id', locationId)
    .eq('status', 'draft')
    .not('scheduled_for', 'is', null)

  if (error) {
    actions.push({
      type: 'post_publishing',
      status: 'failed',
      summary: `Failed to promote draft posts: ${error.message}`,
    })
    return
  }

  actions.push({
    type: 'post_publishing',
    status: 'completed',
    summary: `Promoted ${drafts.length} draft post(s) to pending for auto-publish`,
    details: { count: drafts.length },
  })
}
