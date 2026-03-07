import { createAdminClient } from '@/lib/supabase/admin'
import { getValidAccessToken } from '@/lib/google/auth'
import { auditGBPProfile, type AuditResult } from '@/lib/ai/profile-audit'
import { generateProfileDescription, suggestCategories } from '@/lib/ai/profile-optimize'
import {
  updateGBPProfile, fetchGBPProfile, normalizeGBPProfile, type GBPProfileRaw,
  searchCategories,
  fetchAvailableAttributes, fetchLocationAttributes, updateLocationAttributes,
} from '@/lib/google/profiles'
import type { GBPProfile, ServiceTier } from '@/lib/types'
import { tierIncludes } from '@/lib/tiers'

export type ProfileSkillKey = 'description' | 'categories' | 'attributes' | 'hours' | 'media' | 'services' | 'website'

export type ProfileSkillTrust = 'auto' | 'queue' | 'off'

export const DEFAULT_PROFILE_SKILLS: Record<ProfileSkillKey, ProfileSkillTrust> = {
  description: 'queue',
  categories: 'queue',
  attributes: 'queue',
  hours: 'queue',
  media: 'queue',
  services: 'queue',
  website: 'queue',
}

export interface AgentConfig {
  location_id: string
  enabled: boolean
  review_replies: 'auto' | 'queue' | 'off'
  post_publishing: 'auto' | 'queue' | 'off'
  auto_reply_min_rating: number
  auto_reply_max_rating: number
  escalate_below_rating: number
  tone: string
  business_context: string | null
  profile_skills: Record<ProfileSkillKey, ProfileSkillTrust>
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

type AdminClient = ReturnType<typeof createAdminClient>

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
  let profile: GBPProfile | null = null

  if (tierIncludes(tier, 'profile_optimization')) {
    const { data: profileData } = await adminClient
      .from('gbp_profiles')
      .select('*')
      .eq('location_id', locationId)
      .single()

    profile = profileData as GBPProfile | null

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

      const { data: ratingRows } = await adminClient
        .from('reviews')
        .select('rating')
        .eq('source_id', locationId)

      const avgRating = ratingRows && ratingRows.length > 0
        ? ratingRows.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / ratingRows.length
        : null

      audit = auditGBPProfile({
        profile,
        mediaCount: mediaCount || 0,
        reviewCount: reviewCount || 0,
        avgRating,
        responseRate: reviewCount && reviewCount > 0
          ? (repliedReviews?.length || 0) / reviewCount
          : 0,
        postCount: postCount || 0,
      })

      result.audit_score = audit.score

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
  const skills = config.profile_skills ?? DEFAULT_PROFILE_SKILLS
  const hasAnyProfileSkill = Object.values(skills).some((v) => v !== 'off')

  if (hasAnyProfileSkill && audit && profile && tierIncludes(tier, 'profile_optimization')) {
    // Fetch intake data for richer context
    const { data: intakeRow } = await adminClient
      .from('locations')
      .select('intake_data')
      .eq('id', locationId)
      .single()
    const intake = (intakeRow as any)?.intake_data || {}

    // Map audit section keys to skill keys (photos → media)
    const sectionToSkill: Record<string, ProfileSkillKey> = {
      description: 'description',
      categories: 'categories',
      attributes: 'attributes',
      photos: 'media',
      hours: 'hours',
    }

    const sectionHandlers: Record<string, () => Promise<void>> = {
      description: () => handleDescription(adminClient, locationId, location, profile!, skills.description, actions),
      categories: () => handleCategories(adminClient, locationId, profile!, skills.categories, actions, intake),
      attributes: () => handleAttributes(adminClient, locationId, profile!, skills.attributes, actions),
      photos: () => handleMedia(adminClient, locationId, skills.media, actions, intake),
      hours: () => handleHours(adminClient, locationId, profile!, skills.hours, actions, intake),
      activity: () => Promise.resolve(), // Handled by post_publishing trust level below
    }

    for (const section of audit.sections) {
      if (section.status === 'good') continue
      const skillKey = sectionToSkill[section.key]
      if (skillKey && skills[skillKey] === 'off') continue
      const handler = sectionHandlers[section.key]
      if (handler) {
        try {
          await handler()
        } catch (err) {
          actions.push({
            type: 'profile_update',
            status: 'failed',
            summary: `${section.key}: ${err instanceof Error ? err.message : 'Unknown error'}`,
          })
        }
      }
    }

    // Services — check if intake has services not yet on the profile
    if (skills.services !== 'off') {
      await handleServices(adminClient, locationId, profile, skills.services, actions, intake)
    }

    // Website — check for UTM tracking
    if (skills.website !== 'off') {
      await handleWebsiteTracking(adminClient, locationId, profile, skills.website, actions)
    }
  }

  // ─── DECIDE + ACT: Auto-apply pending recommendations ─────
  const hasAutoSkill = Object.values(skills).some((v) => v === 'auto')
  if (hasAutoSkill && tierIncludes(tier, 'profile_optimization')) {
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

// ════════════════════════════════════════════════════════════
// Section handlers
// ════════════════════════════════════════════════════════════

/**
 * Check if a recommendation already exists for this field.
 */
async function hasExistingRec(adminClient: AdminClient, locationId: string, field: string): Promise<boolean> {
  const { data } = await adminClient
    .from('profile_recommendations')
    .select('id')
    .eq('location_id', locationId)
    .eq('field', field)
    .in('status', ['pending', 'approved', 'client_review'])
    .single()
  return !!data
}

/**
 * Queue a recommendation (or auto-apply will pick it up next run).
 */
async function queueRecommendation(
  adminClient: AdminClient,
  locationId: string,
  field: string,
  currentValue: unknown,
  proposedValue: unknown,
  rationale: string,
  actions: AgentAction[]
) {
  await adminClient.from('profile_recommendations').insert({
    location_id: locationId,
    field,
    current_value: currentValue,
    proposed_value: proposedValue,
    ai_rationale: rationale,
    status: 'pending',
    requires_client_approval: false,
  })

  actions.push({
    type: 'recommendation_queued',
    status: 'queued',
    summary: `${field}: recommendation queued for approval`,
    details: { field },
  })
}

// ─── Description ────────────────────────────────────────────

async function handleDescription(
  adminClient: AdminClient,
  locationId: string,
  location: { name: string; city: string | null; state: string | null },
  profile: GBPProfile,
  trust: ProfileSkillTrust,
  actions: AgentAction[]
) {
  if (await hasExistingRec(adminClient, locationId, 'description')) return

  const services = (profile.service_items || [])
    .map((s: any) => s.structuredServiceItem?.description || s.freeFormServiceItem?.label?.displayName || '')
    .filter(Boolean)

  // Fetch brand voice from org
  const { data: brandConfig } = await adminClient
    .from('brand_config')
    .select('voice_selections')
    .eq('org_id', (await adminClient.from('locations').select('org_id').eq('id', locationId).single()).data?.org_id)
    .single()

  const voiceNotes = brandConfig?.voice_selections
    ? [
        brandConfig.voice_selections.personality,
        ...(brandConfig.voice_selections.tone || []),
        brandConfig.voice_selections.formality,
        brandConfig.voice_selections.notes,
      ].filter(Boolean).join('. ')
    : null

  const newDescription = await generateProfileDescription({
    businessName: profile.business_name || location.name,
    category: profile.primary_category_name,
    city: location.city,
    state: location.state,
    services,
    currentDescription: profile.description,
    brandVoice: voiceNotes,
  })

  if (trust === 'auto') {
    try {
      await getValidAccessToken()
      await updateGBPProfile(
        profile.gbp_location_name,
        { profile: { description: newDescription } } as Partial<GBPProfileRaw>,
        'profile.description'
      )

      const raw = await fetchGBPProfile(profile.gbp_location_name)
      const normalized = normalizeGBPProfile(raw)
      await adminClient
        .from('gbp_profiles')
        .update({ ...normalized, last_pushed_at: new Date().toISOString(), last_synced_at: new Date().toISOString() })
        .eq('location_id', locationId)

      await adminClient.from('profile_recommendations').insert({
        location_id: locationId,
        field: 'description',
        current_value: profile.description,
        proposed_value: newDescription,
        status: 'applied',
        applied_at: new Date().toISOString(),
        requires_client_approval: false,
      })

      actions.push({
        type: 'description_optimization',
        status: 'completed',
        summary: `Auto-updated profile description`,
        details: { old_length: (profile.description || '').length, new_length: newDescription.length },
      })
    } catch (err) {
      actions.push({
        type: 'description_optimization',
        status: 'failed',
        summary: `Failed to auto-update description: ${err instanceof Error ? err.message : 'Unknown error'}`,
      })
    }
  } else {
    await queueRecommendation(
      adminClient, locationId, 'description',
      profile.description, newDescription,
      'Description is too short or missing. Generated an SEO-optimized version.',
      actions
    )
  }
}

// ─── Categories ─────────────────────────────────────────────

async function handleCategories(
  adminClient: AdminClient,
  locationId: string,
  profile: GBPProfile,
  trust: ProfileSkillTrust,
  actions: AgentAction[],
  intake: Record<string, any>
) {
  if (await hasExistingRec(adminClient, locationId, 'categories')) return

  const currentCategories = [
    profile.primary_category_name,
    ...(profile.additional_categories || []).map((c) => c.displayName),
  ].filter(Boolean) as string[]

  // Use AI to suggest categories based on business info
  const services = intake.services?.map((s: any) => s.name || s) || []
  const suggestions = await suggestCategories({
    businessName: profile.business_name || '',
    currentCategories,
    services,
  })

  if (suggestions.length === 0) return

  // Validate suggestions against Google's category API
  const validCategories: Array<{ name: string; displayName: string }> = []
  for (const suggestion of suggestions.slice(0, 5)) {
    try {
      const results = await searchCategories(suggestion)
      // Find best match
      const match = results.find((r) =>
        r.displayName.toLowerCase() === suggestion.toLowerCase()
      ) || results[0]
      if (match && !currentCategories.includes(match.displayName)) {
        validCategories.push({ name: match.name, displayName: match.displayName })
      }
    } catch {
      // Category search failed — skip
    }
  }

  if (validCategories.length === 0) return

  if (trust === 'auto') {
    try {
      await getValidAccessToken()
      const newAdditional = [
        ...(profile.additional_categories || []),
        ...validCategories,
      ]
      await updateGBPProfile(
        profile.gbp_location_name,
        { categories: { additionalCategories: newAdditional.map((c) => ({ name: c.name })) } } as any,
        'categories.additionalCategories'
      )

      const raw = await fetchGBPProfile(profile.gbp_location_name)
      const normalized = normalizeGBPProfile(raw)
      await adminClient
        .from('gbp_profiles')
        .update({ ...normalized, last_pushed_at: new Date().toISOString(), last_synced_at: new Date().toISOString() })
        .eq('location_id', locationId)

      await adminClient.from('profile_recommendations').insert({
        location_id: locationId,
        field: 'categories',
        current_value: currentCategories,
        proposed_value: [...currentCategories, ...validCategories.map((c) => c.displayName)],
        status: 'applied',
        applied_at: new Date().toISOString(),
        requires_client_approval: false,
      })

      actions.push({
        type: 'category_update',
        status: 'completed',
        summary: `Added ${validCategories.length} categories: ${validCategories.map((c) => c.displayName).join(', ')}`,
        details: { added: validCategories.map((c) => c.displayName) },
      })
    } catch (err) {
      actions.push({
        type: 'category_update',
        status: 'failed',
        summary: `Failed to update categories: ${err instanceof Error ? err.message : 'Unknown error'}`,
      })
    }
  } else {
    await queueRecommendation(
      adminClient, locationId, 'categories',
      currentCategories,
      [...currentCategories, ...validCategories.map((c) => c.displayName)],
      `Suggest adding: ${validCategories.map((c) => c.displayName).join(', ')}. Helps appear in more relevant searches.`,
      actions
    )
  }
}

// ─── Attributes ─────────────────────────────────────────────

async function handleAttributes(
  adminClient: AdminClient,
  locationId: string,
  profile: GBPProfile,
  trust: ProfileSkillTrust,
  actions: AgentAction[]
) {
  if (await hasExistingRec(adminClient, locationId, 'attributes')) return
  if (!profile.primary_category_id) return

  try {
    await getValidAccessToken()

    // Fetch what attributes are available vs what's set
    const [available, current] = await Promise.all([
      fetchAvailableAttributes(profile.primary_category_id),
      fetchLocationAttributes(profile.gbp_location_name),
    ])

    const currentIds = new Set(current.map((a: any) => a.name?.split('/').pop() || ''))

    // Find common attributes that aren't set yet
    // Focus on BOOL type (yes/no attributes) as they're easiest to suggest
    const missingBool = available.filter(
      (a) => a.valueType === 'BOOL' && !currentIds.has(a.attributeId)
    )

    if (missingBool.length === 0) return

    // Queue as a recommendation — we can't guess attribute values
    const attributeNames = missingBool.slice(0, 10).map((a) => a.displayName)
    await queueRecommendation(
      adminClient, locationId, 'attributes',
      { set_count: current.length },
      { missing: attributeNames, total_available: available.length },
      `${missingBool.length} attributes available but not set: ${attributeNames.join(', ')}. Setting these helps search visibility.`,
      actions
    )
  } catch (err) {
    actions.push({
      type: 'attribute_update',
      status: 'failed',
      summary: `Failed to check attributes: ${err instanceof Error ? err.message : 'Unknown error'}`,
    })
  }
}

// ─── Media (photos / cover / logo) ──────────────────────────

async function handleMedia(
  adminClient: AdminClient,
  locationId: string,
  trust: ProfileSkillTrust,
  actions: AgentAction[],
  intake: Record<string, any>
) {
  if (await hasExistingRec(adminClient, locationId, 'media')) return

  // Check what media exists
  const { data: media } = await adminClient
    .from('gbp_media')
    .select('category')
    .eq('location_id', locationId)

  const categories = new Set((media || []).map((m: any) => m.category))
  const missing: string[] = []

  if (!categories.has('COVER')) missing.push('cover photo')
  if (!categories.has('LOGO')) missing.push('logo')
  if ((media || []).length < 5) missing.push('additional photos (fewer than 5 total)')

  if (missing.length === 0) return

  // Check if intake has a cloud folder URL for sourcing media
  const hasCloudFolder = !!intake.cloud_folder_url

  await queueRecommendation(
    adminClient, locationId, 'media',
    { total_photos: (media || []).length, categories: Array.from(categories) },
    { missing, cloud_folder_url: intake.cloud_folder_url || null },
    `Missing: ${missing.join(', ')}.${hasCloudFolder ? ' Client provided media folder — check for usable assets.' : ' Request photos from client.'} Profiles with 10+ photos get 35% more clicks.`,
    actions
  )
}

// ─── Hours ──────────────────────────────────────────────────

async function handleHours(
  adminClient: AdminClient,
  locationId: string,
  profile: GBPProfile,
  trust: ProfileSkillTrust,
  actions: AgentAction[],
  intake: Record<string, any>
) {
  if (await hasExistingRec(adminClient, locationId, 'hours')) return

  const hasHours = profile.regular_hours?.periods && profile.regular_hours.periods.length > 0

  if (hasHours) return // Hours are set — audit scored it fine

  // Hours are missing — can we fill them from intake?
  if (intake.hours_of_operation) {
    await queueRecommendation(
      adminClient, locationId, 'hours',
      null,
      { from_intake: intake.hours_of_operation },
      `No hours set on GBP. Client provided hours in intake: "${intake.hours_of_operation}". Add these to the profile.`,
      actions
    )
  } else {
    await queueRecommendation(
      adminClient, locationId, 'hours',
      null,
      null,
      'No business hours set on GBP profile. Request hours from client — missing hours significantly hurt local search ranking.',
      actions
    )
  }
}

// ─── Services ───────────────────────────────────────────────

async function handleServices(
  adminClient: AdminClient,
  locationId: string,
  profile: GBPProfile,
  trust: ProfileSkillTrust,
  actions: AgentAction[],
  intake: Record<string, any>
) {
  if (await hasExistingRec(adminClient, locationId, 'services')) return

  const intakeServices: Array<{ name: string; description?: string }> = intake.services || []
  if (intakeServices.length === 0) return

  // Compare intake services to what's on the profile
  const existingServices = (profile.service_items || [])
    .map((s: any) =>
      (s.structuredServiceItem?.description || s.freeFormServiceItem?.label?.displayName || '').toLowerCase()
    )
    .filter(Boolean)

  const existingSet = new Set(existingServices)
  const missing = intakeServices.filter(
    (s) => !existingSet.has(s.name.toLowerCase())
  )

  if (missing.length === 0) return

  if (trust === 'auto') {
    try {
      await getValidAccessToken()
      const newServiceItems = [
        ...(profile.service_items || []),
        ...missing.map((s) => ({
          freeFormServiceItem: {
            category: profile.primary_category_name || 'Service',
            label: { displayName: s.name, description: s.description || '' },
          },
        })),
      ]

      await updateGBPProfile(
        profile.gbp_location_name,
        { serviceItems: newServiceItems } as any,
        'serviceItems'
      )

      const raw = await fetchGBPProfile(profile.gbp_location_name)
      const normalized = normalizeGBPProfile(raw)
      await adminClient
        .from('gbp_profiles')
        .update({ ...normalized, last_pushed_at: new Date().toISOString(), last_synced_at: new Date().toISOString() })
        .eq('location_id', locationId)

      actions.push({
        type: 'service_update',
        status: 'completed',
        summary: `Added ${missing.length} services from intake: ${missing.map((s) => s.name).join(', ')}`,
        details: { added: missing.map((s) => s.name) },
      })
    } catch (err) {
      actions.push({
        type: 'service_update',
        status: 'failed',
        summary: `Failed to add services: ${err instanceof Error ? err.message : 'Unknown error'}`,
      })
    }
  } else {
    await queueRecommendation(
      adminClient, locationId, 'services',
      existingServices,
      [...existingServices, ...missing.map((s) => s.name)],
      `${missing.length} services from intake not on profile: ${missing.map((s) => s.name).join(', ')}. Adding services improves keyword relevance.`,
      actions
    )
  }
}

// ─── Website UTM tracking ───────────────────────────────────

async function handleWebsiteTracking(
  adminClient: AdminClient,
  locationId: string,
  profile: GBPProfile,
  trust: ProfileSkillTrust,
  actions: AgentAction[]
) {
  if (!profile.website_uri) return
  if (await hasExistingRec(adminClient, locationId, 'website')) return

  // Check if website URL already has UTM parameters
  const url = profile.website_uri
  if (url.includes('utm_source') || url.includes('utm_medium')) return

  // Suggest adding UTM tracking
  const trackedUrl = addUtmParams(url, {
    utm_source: 'google',
    utm_medium: 'organic',
    utm_campaign: 'gbp',
  })

  if (trust === 'auto') {
    try {
      await getValidAccessToken()
      await updateGBPProfile(
        profile.gbp_location_name,
        { websiteUri: trackedUrl } as any,
        'websiteUri'
      )

      const raw = await fetchGBPProfile(profile.gbp_location_name)
      const normalized = normalizeGBPProfile(raw)
      await adminClient
        .from('gbp_profiles')
        .update({ ...normalized, last_pushed_at: new Date().toISOString(), last_synced_at: new Date().toISOString() })
        .eq('location_id', locationId)

      actions.push({
        type: 'website_update',
        status: 'completed',
        summary: `Added UTM tracking to website URL`,
        details: { old_url: url, new_url: trackedUrl },
      })
    } catch (err) {
      actions.push({
        type: 'website_update',
        status: 'failed',
        summary: `Failed to update website URL: ${err instanceof Error ? err.message : 'Unknown error'}`,
      })
    }
  } else {
    await queueRecommendation(
      adminClient, locationId, 'website',
      url, trackedUrl,
      'Website URL has no UTM tracking. Adding utm_source=google&utm_medium=organic&utm_campaign=gbp enables attribution in analytics.',
      actions
    )
  }
}

function addUtmParams(url: string, params: Record<string, string>): string {
  const parsed = new URL(url)
  for (const [key, val] of Object.entries(params)) {
    if (!parsed.searchParams.has(key)) {
      parsed.searchParams.set(key, val)
    }
  }
  return parsed.toString()
}

// ════════════════════════════════════════════════════════════
// Auto-apply + post publishing (unchanged)
// ════════════════════════════════════════════════════════════

/**
 * Auto-apply any pending profile recommendations that don't require client approval.
 */
async function autoApplyPendingRecs(
  adminClient: AdminClient,
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
      } else if (rec.field === 'hours' || rec.field === 'media' || rec.field === 'attributes') {
        // These require human interpretation — mark as applied (informational)
        await adminClient
          .from('profile_recommendations')
          .update({ status: 'applied', applied_at: new Date().toISOString() })
          .eq('id', rec.id)
        actions.push({
          type: 'recommendation_applied',
          status: 'completed',
          summary: `Marked ${rec.field} recommendation as applied`,
        })
        continue
      } else if (rec.field === 'website') {
        fields.websiteUri = value as string
        updateMaskParts.push('websiteUri')
      }

      if (updateMaskParts.length > 0) {
        await updateGBPProfile(
          (profile as any).gbp_location_name,
          fields,
          updateMaskParts.join(',')
        )

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
 */
async function promoteDraftPosts(
  adminClient: AdminClient,
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
      type: 'post_promotion',
      status: 'failed',
      summary: `Failed to promote draft posts: ${error.message}`,
    })
    return
  }

  actions.push({
    type: 'post_promotion',
    status: 'completed',
    summary: `Promoted ${drafts.length} draft post(s) to pending for auto-publish`,
    details: { count: drafts.length },
  })
}
