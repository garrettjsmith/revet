import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateReviewReply } from '@/lib/ai/generate-reply'
import { generateGBPPost } from '@/lib/ai/generate-post'
import { auditGBPProfile } from '@/lib/ai/profile-audit'
import { generateProfileDescription } from '@/lib/ai/profile-optimize'

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const READ_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_reviews',
    description:
      'Query reviews with optional filters. Returns individual reviews with reviewer name, rating, body, reply status, platform, and date. Use for "show me recent reviews", "negative reviews", "reviews for location X", etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        location_id: { type: 'string', description: 'Filter to a specific location' },
        org_id: { type: 'string', description: 'Filter to a specific org' },
        platform: { type: 'string', enum: ['google', 'healthgrades', 'yelp', 'facebook', 'vitals', 'zocdoc'] },
        min_rating: { type: 'number', description: 'Minimum star rating (1-5)' },
        max_rating: { type: 'number', description: 'Maximum star rating (1-5)' },
        status: { type: 'string', enum: ['new', 'seen', 'flagged', 'responded', 'archived'] },
        has_reply: { type: 'boolean', description: 'Filter to reviews with/without replies' },
        date_from: { type: 'string', description: 'ISO date string, reviews published after this date' },
        date_to: { type: 'string', description: 'ISO date string, reviews published before this date' },
        limit: { type: 'number', description: 'Max results to return (default 10, max 50)' },
      },
    },
  },
  {
    name: 'get_review_stats',
    description:
      'Get aggregate review statistics: total count, average rating, counts by star rating, response rate, and period comparisons. Use for "how are reviews trending", "what is our average rating", etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        location_id: { type: 'string' },
        org_id: { type: 'string' },
        period: { type: 'string', enum: ['7d', '30d', '90d', '365d'], description: 'Time period for trend comparison' },
      },
    },
  },
  {
    name: 'get_locations',
    description:
      'List locations with summary info. Returns name, city, state, setup status, service tier, and basic stats. Use for "list our locations", "locations in Texas", "which locations need setup", etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        org_id: { type: 'string' },
        search: { type: 'string', description: 'Search by location name' },
        city: { type: 'string' },
        state: { type: 'string' },
        setup_status: { type: 'string', enum: ['pending', 'audited', 'optimizing', 'optimized'] },
        active: { type: 'boolean' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    },
  },
  {
    name: 'get_location_details',
    description:
      'Get full details for a single location including GBP profile data, review sources, audit score, and recent activity. Use when the user asks about a specific location.',
    input_schema: {
      type: 'object' as const,
      properties: {
        location_id: { type: 'string', description: 'The location ID' },
      },
      required: ['location_id'],
    },
  },
  {
    name: 'get_performance_metrics',
    description:
      'Get GBP performance metrics: search impressions, map views, website clicks, phone calls, direction requests. Use for "how is this location performing", "show me traffic data", etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        location_id: { type: 'string', description: 'The location ID' },
        date_from: { type: 'string', description: 'ISO date string' },
        date_to: { type: 'string', description: 'ISO date string' },
      },
      required: ['location_id'],
    },
  },
  {
    name: 'get_profile_audit',
    description:
      'Get the latest GBP profile audit score and section breakdown for a location. Shows scores for description, categories, hours, attributes, photos, reviews, and activity.',
    input_schema: {
      type: 'object' as const,
      properties: {
        location_id: { type: 'string' },
      },
      required: ['location_id'],
    },
  },
  {
    name: 'get_posts',
    description:
      'Get GBP posts (published or queued). Use for "recent posts", "what is scheduled", "post history", etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        location_id: { type: 'string' },
        org_id: { type: 'string' },
        queue_status: { type: 'string', enum: ['draft', 'client_review', 'pending', 'sending', 'confirmed', 'failed', 'rejected'], description: 'Filter queued posts by status' },
        published: { type: 'boolean', description: 'true for published posts, false for queued. Omit for both.' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
    },
  },
  {
    name: 'get_org_overview',
    description:
      'Get high-level summary for an organization: location count, total reviews, average rating, active review sources, pending work items. Use for "org summary", "how is [org] doing", etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        org_id: { type: 'string', description: 'The organization ID' },
      },
      required: ['org_id'],
    },
  },
  {
    name: 'get_review_sources',
    description:
      'Get review source platforms and their sync status for a location. Shows platform, total reviews, average rating, last synced time.',
    input_schema: {
      type: 'object' as const,
      properties: {
        location_id: { type: 'string' },
      },
      required: ['location_id'],
    },
  },
  {
    name: 'get_landers',
    description:
      'Get local landing pages and their status. Shows slug, heading, active status, and traffic stats.',
    input_schema: {
      type: 'object' as const,
      properties: {
        location_id: { type: 'string' },
        org_id: { type: 'string' },
        active: { type: 'boolean' },
        limit: { type: 'number' },
      },
    },
  },
]

const ADMIN_TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_all_locations',
    description:
      'Search locations across all organizations. Agency admin only. Use when the user wants to find locations across the whole platform.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search by location name' },
        city: { type: 'string' },
        state: { type: 'string' },
        org_name: { type: 'string', description: 'Filter by organization name' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    },
  },
  {
    name: 'get_action_items',
    description:
      'Get items needing attention: negative reviews without replies, sync errors, low audit scores, Google-updated profiles. Agency admin only.',
    input_schema: {
      type: 'object' as const,
      properties: {
        filter: { type: 'string', enum: ['all', 'reviews', 'profiles', 'sync'] },
      },
    },
  },
]

const ADMIN_ACTION_TOOLS: Anthropic.Tool[] = [
  {
    name: 'draft_review_reply',
    description:
      'Generate an AI-drafted reply for a specific review. Returns the draft text — does NOT send it. Always show the draft to the user and ask for confirmation before calling send_review_reply.',
    input_schema: {
      type: 'object' as const,
      properties: {
        review_id: { type: 'string', description: 'The review to reply to' },
        tone: { type: 'string', description: 'Optional tone override (e.g. "empathetic", "brief"). Default: professional and friendly.' },
      },
      required: ['review_id'],
    },
  },
  {
    name: 'send_review_reply',
    description:
      'Queue a review reply for sending. Only call this AFTER showing the user the draft and getting their explicit confirmation. The reply will be queued and sent via the platform.',
    input_schema: {
      type: 'object' as const,
      properties: {
        review_id: { type: 'string', description: 'The review to reply to' },
        reply_text: { type: 'string', description: 'The final reply text to send' },
      },
      required: ['review_id', 'reply_text'],
    },
  },
  {
    name: 'generate_post_draft',
    description:
      'Generate a GBP post draft for a location. Returns headline + body — does NOT publish it. Always show the draft to the user and ask for confirmation before calling schedule_post.',
    input_schema: {
      type: 'object' as const,
      properties: {
        location_id: { type: 'string', description: 'The location to generate a post for' },
        topic: { type: 'string', description: 'Optional topic or theme for the post' },
      },
      required: ['location_id'],
    },
  },
  {
    name: 'schedule_post',
    description:
      'Add a post to the GBP post queue for a location. Only call this AFTER showing the user the draft and getting their explicit confirmation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        location_id: { type: 'string', description: 'The location to post for' },
        headline: { type: 'string', description: 'Post headline' },
        summary: { type: 'string', description: 'Post body text' },
        topic_type: { type: 'string', enum: ['STANDARD', 'EVENT', 'OFFER'], description: 'Post type (default: STANDARD)' },
      },
      required: ['location_id', 'summary'],
    },
  },
  {
    name: 'run_profile_audit',
    description:
      'Run a fresh GBP profile audit for a location. Scores the profile on completeness across 7 categories (description, categories, hours, attributes, photos, reviews, activity). Returns the score and per-section breakdown with suggestions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        location_id: { type: 'string', description: 'The location to audit' },
      },
      required: ['location_id'],
    },
  },
  {
    name: 'update_gbp_field',
    description:
      'Update a field on a GBP profile. Only call this AFTER explaining the change to the user and getting their explicit confirmation. Supported fields: description, phone_primary, website_uri.',
    input_schema: {
      type: 'object' as const,
      properties: {
        location_id: { type: 'string', description: 'The location to update' },
        field: { type: 'string', enum: ['description', 'phone_primary', 'website_uri'], description: 'Which field to update' },
        value: { type: 'string', description: 'The new value' },
      },
      required: ['location_id', 'field', 'value'],
    },
  },
  {
    name: 'generate_optimization_plan',
    description:
      'Generate an optimized business description for a GBP profile using AI. Returns the suggested description — does NOT apply it. Show it to the user and ask before using update_gbp_field to apply.',
    input_schema: {
      type: 'object' as const,
      properties: {
        location_id: { type: 'string', description: 'The location to optimize' },
      },
      required: ['location_id'],
    },
  },
]

/** Get tool definitions based on user role. */
export function getToolDefinitions(isAgencyAdmin: boolean): Anthropic.Tool[] {
  if (isAgencyAdmin) {
    return [...READ_TOOLS, ...ADMIN_TOOLS, ...ADMIN_ACTION_TOOLS]
  }
  return [...READ_TOOLS]
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

interface ToolContext {
  supabase: SupabaseClient
  userId: string
  orgIds: string[] // orgs the user belongs to
  isAgencyAdmin: boolean
}

/** Execute a tool by name and return the result as a JSON-serializable object. */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<unknown> {
  switch (name) {
    case 'get_reviews':
      return execGetReviews(input, ctx)
    case 'get_review_stats':
      return execGetReviewStats(input, ctx)
    case 'get_locations':
      return execGetLocations(input, ctx)
    case 'get_location_details':
      return execGetLocationDetails(input, ctx)
    case 'get_performance_metrics':
      return execGetPerformanceMetrics(input, ctx)
    case 'get_profile_audit':
      return execGetProfileAudit(input, ctx)
    case 'get_posts':
      return execGetPosts(input, ctx)
    case 'get_org_overview':
      return execGetOrgOverview(input, ctx)
    case 'get_review_sources':
      return execGetReviewSources(input, ctx)
    case 'get_landers':
      return execGetLanders(input, ctx)
    case 'search_all_locations':
      return execSearchAllLocations(input, ctx)
    case 'get_action_items':
      return execGetActionItems(input, ctx)
    // Action tools (agency admin only)
    case 'draft_review_reply':
      return execDraftReviewReply(input, ctx)
    case 'send_review_reply':
      return execSendReviewReply(input, ctx)
    case 'generate_post_draft':
      return execGeneratePostDraft(input, ctx)
    case 'schedule_post':
      return execSchedulePost(input, ctx)
    case 'run_profile_audit':
      return execRunProfileAudit(input, ctx)
    case 'update_gbp_field':
      return execUpdateGBPField(input, ctx)
    case 'generate_optimization_plan':
      return execGenerateOptimizationPlan(input, ctx)
    default:
      return { error: `Unknown tool: ${name}` }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Scope a query to the user's accessible orgs (unless agency admin). */
function scopeOrgFilter(
  orgId: string | undefined,
  ctx: ToolContext
): string[] {
  if (orgId) {
    // If user specified an org, check they have access
    if (!ctx.isAgencyAdmin && !ctx.orgIds.includes(orgId)) {
      return []
    }
    return [orgId]
  }
  if (ctx.isAgencyAdmin) {
    return [] // empty = no filter (all orgs)
  }
  return ctx.orgIds
}

/** Verify the user has access to a location. */
async function verifyLocationAccess(
  locationId: string,
  ctx: ToolContext
): Promise<boolean> {
  if (ctx.isAgencyAdmin) return true
  const { data } = await ctx.supabase
    .from('locations')
    .select('org_id')
    .eq('id', locationId)
    .single()
  return data ? ctx.orgIds.includes(data.org_id) : false
}

// ---------------------------------------------------------------------------
// Tool executors
// ---------------------------------------------------------------------------

async function execGetReviews(input: Record<string, unknown>, ctx: ToolContext) {
  const limit = Math.min((input.limit as number) || 10, 50)

  let query = ctx.supabase
    .from('reviews')
    .select('id, location_id, platform, reviewer_name, rating, body, reply_body, status, sentiment, published_at, locations(name, org_id)')
    .order('published_at', { ascending: false })
    .limit(limit)

  if (input.location_id) {
    if (!(await verifyLocationAccess(input.location_id as string, ctx))) {
      return { error: 'Access denied to this location' }
    }
    query = query.eq('location_id', input.location_id as string)
  } else {
    // Scope to user's orgs via location join
    const orgFilter = scopeOrgFilter(input.org_id as string | undefined, ctx)
    if (orgFilter.length > 0) {
      // Get location IDs for these orgs
      const { data: locs } = await ctx.supabase
        .from('locations')
        .select('id')
        .in('org_id', orgFilter)
      if (locs && locs.length > 0) {
        query = query.in('location_id', locs.map((l: any) => l.id))
      } else {
        return { reviews: [], count: 0 }
      }
    }
  }

  if (input.platform) query = query.eq('platform', input.platform as string)
  if (input.min_rating) query = query.gte('rating', input.min_rating as number)
  if (input.max_rating) query = query.lte('rating', input.max_rating as number)
  if (input.status) query = query.eq('status', input.status as string)
  if (input.has_reply === true) query = query.not('reply_body', 'is', null)
  if (input.has_reply === false) query = query.is('reply_body', null)
  if (input.date_from) query = query.gte('published_at', input.date_from as string)
  if (input.date_to) query = query.lte('published_at', input.date_to as string)

  const { data, error } = await query
  if (error) return { error: error.message }

  return {
    reviews: (data || []).map((r: any) => ({
      id: r.id,
      location_name: r.locations?.name,
      platform: r.platform,
      reviewer_name: r.reviewer_name,
      rating: r.rating,
      body: r.body?.slice(0, 300),
      has_reply: !!r.reply_body,
      status: r.status,
      sentiment: r.sentiment,
      published_at: r.published_at,
    })),
    count: (data || []).length,
  }
}

async function execGetReviewStats(input: Record<string, unknown>, ctx: ToolContext) {
  const orgFilter = scopeOrgFilter(input.org_id as string | undefined, ctx)

  // Get location IDs to scope
  let locationIds: string[] = []
  if (input.location_id) {
    if (!(await verifyLocationAccess(input.location_id as string, ctx))) {
      return { error: 'Access denied' }
    }
    locationIds = [input.location_id as string]
  } else if (orgFilter.length > 0) {
    const { data: locs } = await ctx.supabase
      .from('locations')
      .select('id')
      .in('org_id', orgFilter)
    locationIds = (locs || []).map((l: any) => l.id)
  }

  // Build query
  let query = ctx.supabase
    .from('reviews')
    .select('rating, reply_body, published_at')

  if (locationIds.length > 0) {
    query = query.in('location_id', locationIds)
  } else if (!ctx.isAgencyAdmin) {
    return { error: 'No accessible locations' }
  }

  const { data: reviews, error } = await query
  if (error) return { error: error.message }
  if (!reviews || reviews.length === 0) return { total: 0, average_rating: null, by_rating: {} }

  // Calculate stats
  const total = reviews.length
  const ratings = reviews.filter((r: any) => r.rating != null)
  const avgRating = ratings.length > 0
    ? Math.round((ratings.reduce((s: number, r: any) => s + r.rating, 0) / ratings.length) * 100) / 100
    : null
  const replied = reviews.filter((r: any) => r.reply_body).length
  const responseRate = total > 0 ? Math.round((replied / total) * 100) : 0

  const byRating: Record<number, number> = {}
  for (const r of ratings) {
    byRating[r.rating] = (byRating[r.rating] || 0) + 1
  }

  // Period comparison
  const period = (input.period as string) || '30d'
  const days = parseInt(period) || 30
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const periodReviews = reviews.filter((r: any) => r.published_at >= cutoff)
  const periodAvg = periodReviews.filter((r: any) => r.rating != null).length > 0
    ? Math.round(
        (periodReviews.filter((r: any) => r.rating != null).reduce((s: number, r: any) => s + r.rating, 0) /
          periodReviews.filter((r: any) => r.rating != null).length) *
          100
      ) / 100
    : null

  return {
    total,
    average_rating: avgRating,
    response_rate_pct: responseRate,
    by_rating: byRating,
    period: { label: period, count: periodReviews.length, average_rating: periodAvg },
  }
}

async function execGetLocations(input: Record<string, unknown>, ctx: ToolContext) {
  const limit = Math.min((input.limit as number) || 20, 50)
  const orgFilter = scopeOrgFilter(input.org_id as string | undefined, ctx)

  let query = ctx.supabase
    .from('locations')
    .select('id, name, city, state, setup_status, service_tier, active, org_id, organizations(name, slug)')
    .order('name')
    .limit(limit)

  if (orgFilter.length > 0) {
    query = query.in('org_id', orgFilter)
  } else if (!ctx.isAgencyAdmin) {
    return { locations: [] }
  }

  if (input.search) query = query.ilike('name', `%${input.search}%`)
  if (input.city) query = query.ilike('city', `%${input.city}%`)
  if (input.state) query = query.ilike('state', `%${input.state}%`)
  if (input.setup_status) query = query.eq('setup_status', input.setup_status as string)
  if (input.active !== undefined) query = query.eq('active', input.active as boolean)

  const { data, error } = await query
  if (error) return { error: error.message }

  return {
    locations: (data || []).map((l: any) => ({
      id: l.id,
      name: l.name,
      city: l.city,
      state: l.state,
      org_name: l.organizations?.name,
      org_slug: l.organizations?.slug,
      setup_status: l.setup_status,
      service_tier: l.service_tier,
      active: l.active,
    })),
    count: (data || []).length,
  }
}

async function execGetLocationDetails(input: Record<string, unknown>, ctx: ToolContext) {
  const locationId = input.location_id as string
  if (!(await verifyLocationAccess(locationId, ctx))) {
    return { error: 'Access denied' }
  }

  // Fetch location + GBP profile + review sources in parallel
  const [locResult, gbpResult, sourcesResult, auditResult] = await Promise.all([
    ctx.supabase
      .from('locations')
      .select('*, organizations(name, slug)')
      .eq('id', locationId)
      .single(),
    ctx.supabase
      .from('gbp_profiles')
      .select('business_name, description, website_uri, phone_primary, primary_category_name, open_status, verification_state, has_pending_edits, has_google_updated, sync_status, last_synced_at, maps_uri')
      .eq('location_id', locationId)
      .single(),
    ctx.supabase
      .from('review_sources')
      .select('platform, sync_status, total_review_count, average_rating, last_synced_at')
      .eq('location_id', locationId),
    ctx.supabase
      .from('audit_history')
      .select('score, sections, created_at')
      .eq('location_id', locationId)
      .order('created_at', { ascending: false })
      .limit(1),
  ])

  const loc = locResult.data as any
  if (!loc) return { error: 'Location not found' }

  return {
    location: {
      id: loc.id,
      name: loc.name,
      city: loc.city,
      state: loc.state,
      phone: loc.phone,
      org_name: loc.organizations?.name,
      setup_status: loc.setup_status,
      service_tier: loc.service_tier,
      active: loc.active,
    },
    gbp_profile: gbpResult.data || null,
    review_sources: (sourcesResult.data || []).map((s: any) => ({
      platform: s.platform,
      sync_status: s.sync_status,
      total_reviews: s.total_review_count,
      avg_rating: s.average_rating,
      last_synced: s.last_synced_at,
    })),
    latest_audit: auditResult.data?.[0] || null,
  }
}

async function execGetPerformanceMetrics(input: Record<string, unknown>, ctx: ToolContext) {
  const locationId = input.location_id as string
  if (!(await verifyLocationAccess(locationId, ctx))) {
    return { error: 'Access denied' }
  }

  let query = ctx.supabase
    .from('gbp_performance_metrics')
    .select('date, metric, value')
    .eq('location_id', locationId)
    .order('date', { ascending: false })

  if (input.date_from) query = query.gte('date', input.date_from as string)
  if (input.date_to) query = query.lte('date', input.date_to as string)

  query = query.limit(500)

  const { data, error } = await query
  if (error) return { error: error.message }

  // Group by metric
  const byMetric: Record<string, { total: number; data_points: number; latest: number | null }> = {}
  for (const row of data || []) {
    const r = row as any
    if (!byMetric[r.metric]) {
      byMetric[r.metric] = { total: 0, data_points: 0, latest: null }
    }
    byMetric[r.metric].total += r.value
    byMetric[r.metric].data_points++
    if (byMetric[r.metric].latest === null) byMetric[r.metric].latest = r.value
  }

  return { location_id: locationId, metrics: byMetric }
}

async function execGetProfileAudit(input: Record<string, unknown>, ctx: ToolContext) {
  const locationId = input.location_id as string
  if (!(await verifyLocationAccess(locationId, ctx))) {
    return { error: 'Access denied' }
  }

  const { data, error } = await ctx.supabase
    .from('audit_history')
    .select('score, sections, created_at')
    .eq('location_id', locationId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) return { error: error.message }
  if (!data || data.length === 0) return { audit: null, message: 'No audit found for this location' }

  return { audit: data[0] }
}

async function execGetPosts(input: Record<string, unknown>, ctx: ToolContext) {
  const limit = Math.min((input.limit as number) || 10, 50)

  // Determine location scope
  let locationIds: string[] = []
  if (input.location_id) {
    if (!(await verifyLocationAccess(input.location_id as string, ctx))) {
      return { error: 'Access denied' }
    }
    locationIds = [input.location_id as string]
  } else {
    const orgFilter = scopeOrgFilter(input.org_id as string | undefined, ctx)
    if (orgFilter.length > 0) {
      const { data: locs } = await ctx.supabase.from('locations').select('id').in('org_id', orgFilter)
      locationIds = (locs || []).map((l: any) => l.id)
    } else if (!ctx.isAgencyAdmin) {
      return { published: [], queued: [] }
    }
  }

  const results: { published?: any[]; queued?: any[] } = {}

  // Published posts
  if (input.published !== false) {
    let pubQuery = ctx.supabase
      .from('gbp_posts')
      .select('id, location_id, topic_type, summary, state, create_time, locations(name)')
      .order('create_time', { ascending: false })
      .limit(limit)
    if (locationIds.length > 0) pubQuery = pubQuery.in('location_id', locationIds)
    const { data } = await pubQuery
    results.published = (data || []).map((p: any) => ({
      id: p.id,
      location_name: p.locations?.name,
      type: p.topic_type,
      summary: p.summary?.slice(0, 200),
      state: p.state,
      published_at: p.create_time,
    }))
  }

  // Queued posts
  if (input.published !== true) {
    let queueQuery = ctx.supabase
      .from('gbp_post_queue')
      .select('id, location_id, topic_type, summary, status, scheduled_for, source, locations(name)')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (locationIds.length > 0) queueQuery = queueQuery.in('location_id', locationIds)
    if (input.queue_status) queueQuery = queueQuery.eq('status', input.queue_status as string)
    const { data } = await queueQuery
    results.queued = (data || []).map((p: any) => ({
      id: p.id,
      location_name: p.locations?.name,
      type: p.topic_type,
      summary: p.summary?.slice(0, 200),
      status: p.status,
      scheduled_for: p.scheduled_for,
      source: p.source,
    }))
  }

  return results
}

async function execGetOrgOverview(input: Record<string, unknown>, ctx: ToolContext) {
  const orgId = input.org_id as string
  if (!ctx.isAgencyAdmin && !ctx.orgIds.includes(orgId)) {
    return { error: 'Access denied' }
  }

  const [orgResult, locsResult, sourcesResult] = await Promise.all([
    ctx.supabase.from('organizations').select('name, slug, status').eq('id', orgId).single(),
    ctx.supabase.from('locations').select('id, name, setup_status, active').eq('org_id', orgId),
    ctx.supabase
      .from('review_sources')
      .select('total_review_count, average_rating, location_id, locations!inner(org_id)')
      .eq('locations.org_id', orgId),
  ])

  const org = orgResult.data as any
  if (!org) return { error: 'Organization not found' }

  const locations = locsResult.data || []
  const sources = sourcesResult.data || []

  const totalReviews = sources.reduce((s: number, src: any) => s + (src.total_review_count || 0), 0)
  const ratingSources = sources.filter((s: any) => s.average_rating != null)
  const avgRating = ratingSources.length > 0
    ? Math.round((ratingSources.reduce((s: number, src: any) => s + src.average_rating, 0) / ratingSources.length) * 100) / 100
    : null

  const byStatus: Record<string, number> = {}
  for (const loc of locations) {
    const l = loc as any
    byStatus[l.setup_status] = (byStatus[l.setup_status] || 0) + 1
  }

  return {
    org: { name: org.name, slug: org.slug, status: org.status },
    locations: {
      total: locations.length,
      active: locations.filter((l: any) => l.active).length,
      by_setup_status: byStatus,
    },
    reviews: { total: totalReviews, average_rating: avgRating },
  }
}

async function execGetReviewSources(input: Record<string, unknown>, ctx: ToolContext) {
  const locationId = input.location_id as string
  if (!(await verifyLocationAccess(locationId, ctx))) {
    return { error: 'Access denied' }
  }

  const { data, error } = await ctx.supabase
    .from('review_sources')
    .select('id, platform, platform_listing_name, sync_status, total_review_count, average_rating, last_synced_at')
    .eq('location_id', locationId)

  if (error) return { error: error.message }

  return {
    sources: (data || []).map((s: any) => ({
      id: s.id,
      platform: s.platform,
      listing_name: s.platform_listing_name,
      sync_status: s.sync_status,
      total_reviews: s.total_review_count,
      avg_rating: s.average_rating,
      last_synced: s.last_synced_at,
    })),
  }
}

async function execGetLanders(input: Record<string, unknown>, ctx: ToolContext) {
  const limit = Math.min((input.limit as number) || 20, 50)

  let query = ctx.supabase
    .from('local_landers')
    .select('id, slug, location_id, heading, active, created_at, locations(name, org_id)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (input.location_id) {
    if (!(await verifyLocationAccess(input.location_id as string, ctx))) {
      return { error: 'Access denied' }
    }
    query = query.eq('location_id', input.location_id as string)
  } else {
    const orgFilter = scopeOrgFilter(input.org_id as string | undefined, ctx)
    if (orgFilter.length > 0) {
      const { data: locs } = await ctx.supabase.from('locations').select('id').in('org_id', orgFilter)
      if (locs && locs.length > 0) {
        query = query.in('location_id', locs.map((l: any) => l.id))
      } else {
        return { landers: [] }
      }
    } else if (!ctx.isAgencyAdmin) {
      return { landers: [] }
    }
  }

  if (input.active !== undefined) query = query.eq('active', input.active as boolean)

  const { data, error } = await query
  if (error) return { error: error.message }

  return {
    landers: (data || []).map((l: any) => ({
      id: l.id,
      slug: l.slug,
      location_name: l.locations?.name,
      heading: l.heading,
      active: l.active,
    })),
  }
}

async function execSearchAllLocations(input: Record<string, unknown>, ctx: ToolContext) {
  if (!ctx.isAgencyAdmin) return { error: 'Agency admin required' }

  const limit = Math.min((input.limit as number) || 20, 50)
  let query = ctx.supabase
    .from('locations')
    .select('id, name, city, state, org_id, setup_status, active, organizations(name, slug)')
    .order('name')
    .limit(limit)

  if (input.query) query = query.ilike('name', `%${input.query}%`)
  if (input.city) query = query.ilike('city', `%${input.city}%`)
  if (input.state) query = query.ilike('state', `%${input.state}%`)

  if (input.org_name) {
    const { data: orgs } = await ctx.supabase
      .from('organizations')
      .select('id')
      .ilike('name', `%${input.org_name}%`)
    const orgIds = (orgs || []).map((o: any) => o.id)
    if (orgIds.length > 0) {
      query = query.in('org_id', orgIds)
    } else {
      return { locations: [], count: 0 }
    }
  }

  const { data, error } = await query
  if (error) return { error: error.message }

  return {
    locations: (data || []).map((l: any) => ({
      id: l.id,
      name: l.name,
      city: l.city,
      state: l.state,
      org_name: l.organizations?.name,
      org_slug: l.organizations?.slug,
      setup_status: l.setup_status,
      active: l.active,
    })),
    count: (data || []).length,
  }
}

async function execGetActionItems(_input: Record<string, unknown>, ctx: ToolContext) {
  if (!ctx.isAgencyAdmin) return { error: 'Agency admin required' }

  const filter = (_input.filter as string) || 'all'
  const items: { category: string; items: any[] }[] = []

  // Negative reviews without replies
  if (filter === 'all' || filter === 'reviews') {
    const { data: negReviews } = await ctx.supabase
      .from('reviews')
      .select('id, location_id, reviewer_name, rating, body, published_at, locations(name)')
      .lte('rating', 3)
      .is('reply_body', null)
      .neq('status', 'archived')
      .order('published_at', { ascending: false })
      .limit(20)

    items.push({
      category: 'Negative reviews needing reply',
      items: (negReviews || []).map((r: any) => ({
        review_id: r.id,
        location_name: r.locations?.name,
        reviewer: r.reviewer_name,
        rating: r.rating,
        body: r.body?.slice(0, 150),
        published_at: r.published_at,
      })),
    })
  }

  // Sync errors
  if (filter === 'all' || filter === 'sync') {
    const { data: syncErrors } = await ctx.supabase
      .from('review_sources')
      .select('id, platform, platform_listing_name, location_id, last_synced_at, locations(name)')
      .eq('sync_status', 'error')
      .limit(20)

    items.push({
      category: 'Review source sync errors',
      items: (syncErrors || []).map((s: any) => ({
        source_id: s.id,
        platform: s.platform,
        listing: s.platform_listing_name,
        location_name: s.locations?.name,
        last_synced: s.last_synced_at,
      })),
    })
  }

  // Profiles with Google updates
  if (filter === 'all' || filter === 'profiles') {
    const { data: googleUpdated } = await ctx.supabase
      .from('gbp_profiles')
      .select('location_id, business_name, has_google_updated, has_pending_edits, locations(name)')
      .eq('has_google_updated', true)
      .limit(20)

    items.push({
      category: 'Profiles with Google updates',
      items: (googleUpdated || []).map((p: any) => ({
        location_name: p.locations?.name,
        business_name: p.business_name,
        has_pending_edits: p.has_pending_edits,
      })),
    })
  }

  return { action_items: items }
}

// ---------------------------------------------------------------------------
// Action tool executors (agency admin only)
// ---------------------------------------------------------------------------

async function execDraftReviewReply(input: Record<string, unknown>, ctx: ToolContext) {
  if (!ctx.isAgencyAdmin) return { error: 'Agency admin required' }

  const reviewId = input.review_id as string
  const { data: review, error } = await ctx.supabase
    .from('reviews')
    .select('id, reviewer_name, rating, body, location_id, platform, locations(name, org_id, organizations(name))')
    .eq('id', reviewId)
    .single()

  if (error || !review) return { error: 'Review not found' }

  const loc = (review as any).locations
  const businessName = loc?.organizations?.name || loc?.name || 'the business'

  // Get autopilot config for tone if available
  const { data: autopilotConfig } = await ctx.supabase
    .from('review_autopilot_config')
    .select('tone, business_context')
    .eq('location_id', review.location_id)
    .single()

  const draft = await generateReviewReply({
    businessName,
    businessContext: autopilotConfig?.business_context || null,
    reviewerName: review.reviewer_name,
    rating: review.rating,
    reviewBody: review.body,
    tone: (input.tone as string) || autopilotConfig?.tone || undefined,
  })

  return {
    review_id: review.id,
    reviewer_name: review.reviewer_name,
    rating: review.rating,
    review_body: review.body?.slice(0, 300),
    platform: review.platform,
    location_name: loc?.name,
    draft_reply: draft,
  }
}

async function execSendReviewReply(input: Record<string, unknown>, ctx: ToolContext) {
  if (!ctx.isAgencyAdmin) return { error: 'Agency admin required' }

  const reviewId = input.review_id as string
  const replyText = input.reply_text as string

  // Verify review exists and get location
  const { data: review } = await ctx.supabase
    .from('reviews')
    .select('id, location_id, platform, platform_review_id')
    .eq('id', reviewId)
    .single()

  if (!review) return { error: 'Review not found' }

  // Insert into review_reply_queue
  const { error } = await ctx.supabase
    .from('review_reply_queue')
    .insert({
      review_id: reviewId,
      location_id: review.location_id,
      platform: review.platform,
      platform_review_id: review.platform_review_id,
      reply_body: replyText,
      status: 'pending',
      source: 'manual',
    })

  if (error) return { error: `Failed to queue reply: ${error.message}` }

  // Update review status
  await ctx.supabase
    .from('reviews')
    .update({ status: 'responded', reply_body: replyText })
    .eq('id', reviewId)

  return { status: 'queued', review_id: reviewId, message: 'Reply has been queued for sending.' }
}

async function execGeneratePostDraft(input: Record<string, unknown>, ctx: ToolContext) {
  if (!ctx.isAgencyAdmin) return { error: 'Agency admin required' }

  const locationId = input.location_id as string
  if (!(await verifyLocationAccess(locationId, ctx))) {
    return { error: 'Access denied' }
  }

  // Fetch location + GBP profile context
  const [locResult, gbpResult, recentPostsResult] = await Promise.all([
    ctx.supabase.from('locations').select('name, city, state, org_id, organizations(name)').eq('id', locationId).single(),
    ctx.supabase.from('gbp_profiles').select('business_name, description, primary_category_name, additional_categories').eq('location_id', locationId).single(),
    ctx.supabase.from('gbp_posts').select('summary').eq('location_id', locationId).order('create_time', { ascending: false }).limit(5),
  ])

  const loc = locResult.data as any
  const gbp = gbpResult.data as any
  if (!loc) return { error: 'Location not found' }

  const businessName = gbp?.business_name || loc.organizations?.name || loc.name
  const categories = [gbp?.primary_category_name, ...(gbp?.additional_categories?.map((c: any) => c.name) || [])].filter(Boolean)
  const recentSummaries = (recentPostsResult.data || []).map((p: any) => p.summary).filter(Boolean)

  const draft = await generateGBPPost({
    businessName,
    businessDescription: gbp?.description || null,
    city: loc.city,
    state: loc.state,
    categories,
    recentPostSummaries: recentSummaries,
    topic: input.topic as string | undefined,
  })

  return {
    location_id: locationId,
    location_name: loc.name,
    headline: draft.headline,
    body: draft.summary,
  }
}

async function execSchedulePost(input: Record<string, unknown>, ctx: ToolContext) {
  if (!ctx.isAgencyAdmin) return { error: 'Agency admin required' }

  const locationId = input.location_id as string
  if (!(await verifyLocationAccess(locationId, ctx))) {
    return { error: 'Access denied' }
  }

  const { error } = await ctx.supabase
    .from('gbp_post_queue')
    .insert({
      location_id: locationId,
      topic_type: (input.topic_type as string) || 'STANDARD',
      headline: (input.headline as string) || null,
      summary: input.summary as string,
      status: 'pending',
      source: 'ask_rev',
    })

  if (error) return { error: `Failed to schedule post: ${error.message}` }

  return { status: 'scheduled', location_id: locationId, message: 'Post has been added to the queue.' }
}

async function execRunProfileAudit(input: Record<string, unknown>, ctx: ToolContext) {
  if (!ctx.isAgencyAdmin) return { error: 'Agency admin required' }

  const locationId = input.location_id as string
  if (!(await verifyLocationAccess(locationId, ctx))) {
    return { error: 'Access denied' }
  }

  // Fetch everything needed for the audit
  const [gbpResult, mediaResult, reviewsResult, postsResult] = await Promise.all([
    ctx.supabase.from('gbp_profiles').select('*').eq('location_id', locationId).single(),
    ctx.supabase.from('gbp_media').select('id').eq('location_id', locationId),
    ctx.supabase.from('reviews').select('rating, reply_body').eq('location_id', locationId),
    ctx.supabase.from('gbp_posts').select('id').eq('location_id', locationId).gte('create_time', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
  ])

  if (!gbpResult.data) return { error: 'No GBP profile found for this location' }

  const reviews = reviewsResult.data || []
  const reviewCount = reviews.length
  const avgRating = reviewCount > 0
    ? reviews.filter((r: any) => r.rating != null).reduce((s: number, r: any) => s + r.rating, 0) / reviews.filter((r: any) => r.rating != null).length
    : null
  const replied = reviews.filter((r: any) => r.reply_body).length
  const responseRate = reviewCount > 0 ? replied / reviewCount : 0

  const result = auditGBPProfile({
    profile: gbpResult.data as any,
    mediaCount: (mediaResult.data || []).length,
    reviewCount,
    avgRating,
    responseRate,
    postCount: (postsResult.data || []).length,
  })

  // Save to audit_history
  await ctx.supabase.from('audit_history').insert({
    location_id: locationId,
    score: result.score,
    sections: result.sections,
  })

  return {
    location_id: locationId,
    score: result.score,
    max_score: 100,
    sections: result.sections,
  }
}

async function execUpdateGBPField(input: Record<string, unknown>, ctx: ToolContext) {
  if (!ctx.isAgencyAdmin) return { error: 'Agency admin required' }

  const locationId = input.location_id as string
  const field = input.field as string
  const value = input.value as string

  if (!(await verifyLocationAccess(locationId, ctx))) {
    return { error: 'Access denied' }
  }

  const allowed = ['description', 'phone_primary', 'website_uri']
  if (!allowed.includes(field)) {
    return { error: `Field "${field}" cannot be updated. Allowed: ${allowed.join(', ')}` }
  }

  const { error } = await ctx.supabase
    .from('gbp_profiles')
    .update({ [field]: value, has_pending_edits: true })
    .eq('location_id', locationId)

  if (error) return { error: `Failed to update: ${error.message}` }

  return {
    status: 'updated',
    location_id: locationId,
    field,
    message: `${field} has been updated. Changes will sync to Google on the next push.`,
  }
}

async function execGenerateOptimizationPlan(input: Record<string, unknown>, ctx: ToolContext) {
  if (!ctx.isAgencyAdmin) return { error: 'Agency admin required' }

  const locationId = input.location_id as string
  if (!(await verifyLocationAccess(locationId, ctx))) {
    return { error: 'Access denied' }
  }

  // Fetch profile + location context
  const [locResult, gbpResult] = await Promise.all([
    ctx.supabase.from('locations').select('name, city, state').eq('id', locationId).single(),
    ctx.supabase.from('gbp_profiles').select('business_name, description, primary_category_name, service_items').eq('location_id', locationId).single(),
  ])

  const loc = locResult.data as any
  const gbp = gbpResult.data as any
  if (!gbp) return { error: 'No GBP profile found' }

  const services = (gbp.service_items || [])
    .map((s: any) => s.label || s.displayName || s.structuredServiceItem?.serviceTypeId)
    .filter(Boolean)

  const optimizedDescription = await generateProfileDescription({
    businessName: gbp.business_name || loc?.name || 'the business',
    category: gbp.primary_category_name,
    city: loc?.city,
    state: loc?.state,
    services,
    currentDescription: gbp.description,
  })

  return {
    location_id: locationId,
    location_name: loc?.name,
    current_description: gbp.description,
    suggested_description: optimizedDescription,
    message: 'Here is the suggested optimized description. Use update_gbp_field to apply it.',
  }
}
