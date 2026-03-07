import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAgencyAdmin } from '@/lib/locations'

const DEFAULT_PROFILE_SKILLS = {
  description: 'queue',
  categories: 'queue',
  attributes: 'queue',
  hours: 'queue',
  media: 'queue',
  services: 'queue',
  website: 'queue',
}

const DEFAULTS = {
  enabled: false,
  review_replies: 'queue',
  post_publishing: 'queue',
  auto_reply_min_rating: 4,
  auto_reply_max_rating: 5,
  escalate_below_rating: 3,
  tone: 'professional and friendly',
  business_context: null,
  profile_skills: DEFAULT_PROFILE_SKILLS,
}

/**
 * PUT /api/orgs/[orgId]/agent
 *
 * Bulk update agent config for multiple locations in an org.
 * Body: { location_ids: string[], updates: Partial<AgentConfig> }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { orgId: string } }
) {
  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const body = await request.json()
  const { location_ids, updates } = body as {
    location_ids: string[]
    updates: Record<string, unknown>
  }

  if (!location_ids?.length || !updates) {
    return NextResponse.json({ error: 'location_ids and updates required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Verify all locations belong to this org
  const { data: locations } = await adminClient
    .from('locations')
    .select('id')
    .eq('org_id', params.orgId)
    .in('id', location_ids)

  if (!locations || locations.length !== location_ids.length) {
    return NextResponse.json({ error: 'Some locations not found in this org' }, { status: 400 })
  }

  // Upsert config for each location
  const upserts = location_ids.map((locationId) => ({
    location_id: locationId,
    enabled: updates.enabled ?? DEFAULTS.enabled,
    review_replies: updates.review_replies ?? DEFAULTS.review_replies,
    post_publishing: updates.post_publishing ?? DEFAULTS.post_publishing,
    profile_skills: updates.profile_skills ?? DEFAULTS.profile_skills,
    auto_reply_min_rating: updates.auto_reply_min_rating ?? DEFAULTS.auto_reply_min_rating,
    auto_reply_max_rating: updates.auto_reply_max_rating ?? DEFAULTS.auto_reply_max_rating,
    escalate_below_rating: updates.escalate_below_rating ?? DEFAULTS.escalate_below_rating,
    tone: updates.tone ?? DEFAULTS.tone,
    business_context: updates.business_context ?? DEFAULTS.business_context,
  }))

  const { error } = await adminClient
    .from('location_agent_config')
    .upsert(upserts, { onConflict: 'location_id' })

  if (error) {
    return NextResponse.json({ error: 'Failed to save configs' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, updated: location_ids.length })
}

/**
 * PATCH /api/orgs/[orgId]/agent
 *
 * Partial update — only change specified fields for specified locations.
 * Body: { location_ids: string[], patch: Partial<AgentConfig> }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { orgId: string } }
) {
  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const body = await request.json()
  const { location_ids, patch } = body as {
    location_ids: string[]
    patch: Record<string, unknown>
  }

  if (!location_ids?.length || !patch || Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'location_ids and patch required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Verify locations belong to org
  const { data: locations } = await adminClient
    .from('locations')
    .select('id')
    .eq('org_id', params.orgId)
    .in('id', location_ids)

  if (!locations || locations.length !== location_ids.length) {
    return NextResponse.json({ error: 'Some locations not found in this org' }, { status: 400 })
  }

  // For each location, ensure a row exists then patch it
  // First upsert defaults for any missing configs
  const { data: existing } = await adminClient
    .from('location_agent_config')
    .select('location_id')
    .in('location_id', location_ids)

  const existingIds = new Set(existing?.map((e) => e.location_id) || [])
  const missingIds = location_ids.filter((id) => !existingIds.has(id))

  if (missingIds.length > 0) {
    await adminClient
      .from('location_agent_config')
      .insert(missingIds.map((id) => ({ location_id: id, ...DEFAULTS })))
  }

  // Now update all with the patch
  const { error } = await adminClient
    .from('location_agent_config')
    .update(patch)
    .in('location_id', location_ids)

  if (error) {
    return NextResponse.json({ error: 'Failed to update configs' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, updated: location_ids.length })
}
