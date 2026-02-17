import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 30

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_locations',
    description: 'Search for locations by name, city, state, or organization. Use when the user wants to find or list locations.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Text to search for in location name' },
        city: { type: 'string', description: 'Filter by city name' },
        state: { type: 'string', description: 'Filter by state abbreviation or name' },
        org_name: { type: 'string', description: 'Filter by organization name' },
      },
    },
  },
  {
    name: 'navigate',
    description: 'Navigate to a specific page in the application. Use when the user wants to go to a specific dashboard, settings page, or feature.',
    input_schema: {
      type: 'object' as const,
      properties: {
        destination: {
          type: 'string',
          enum: ['agency_dashboard', 'organizations', 'all_locations', 'integrations', 'notifications', 'landers'],
          description: 'The page to navigate to',
        },
        org_slug: { type: 'string', description: 'Organization slug if navigating to org-specific page' },
        location_id: { type: 'string', description: 'Location ID if navigating to location-specific page' },
      },
      required: ['destination'],
    },
  },
  {
    name: 'show_action_items',
    description: 'Show what needs attention — negative reviews, sync errors, Google updates, low audit scores. Use when the user asks about problems, issues, or what needs work.',
    input_schema: {
      type: 'object' as const,
      properties: {
        filter: {
          type: 'string',
          enum: ['all', 'reviews', 'profiles', 'sync'],
          description: 'Filter action items by category',
        },
      },
    },
  },
  {
    name: 'bulk_update_profiles',
    description: 'Update GBP profile fields (description, phone, website) for multiple locations matching a filter. Use when the user wants to update or change profile information across locations.',
    input_schema: {
      type: 'object' as const,
      properties: {
        location_filter: {
          type: 'object',
          description: 'Filter to select which locations to update',
          properties: {
            org_name: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
          },
        },
        fields: {
          type: 'object',
          description: 'Profile fields to update',
          properties: {
            description: { type: 'string', description: 'New business description' },
            phone_primary: { type: 'string', description: 'New primary phone number' },
            website_uri: { type: 'string', description: 'New website URL' },
          },
        },
      },
      required: ['location_filter', 'fields'],
    },
  },
]

const DESTINATION_PATHS: Record<string, string> = {
  agency_dashboard: '/agency',
  organizations: '/agency/organizations',
  all_locations: '/agency/locations',
  integrations: '/agency/integrations',
  notifications: '/agency/notifications',
  landers: '/agency/landers',
}

let _client: Anthropic | null = null
function getClient() {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}

export async function POST(req: NextRequest) {
  // Auth: agency admin only
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: adminCheck } = await supabase
    .from('org_members')
    .select('is_agency_admin')
    .eq('user_id', user.id)
    .eq('is_agency_admin', true)
    .limit(1)

  if (!adminCheck || adminCheck.length === 0) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const { query } = await req.json()
  if (!query || typeof query !== 'string') {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 })
  }

  try {
    const response = await getClient().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: `You are a command parser for Revet, a search optimization platform. The user will describe what they want to do. Parse their intent and call the most appropriate tool. Be precise with filters — if they mention a city, state, or org, include those in the filter. If unsure, use search_locations to help them find what they need.`,
      tools: TOOLS,
      messages: [{ role: 'user', content: query }],
    })

    // Find the tool use block
    const toolBlock = response.content.find((b) => b.type === 'tool_use')
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      // No tool call — extract text response
      const textBlock = response.content.find((b) => b.type === 'text')
      return NextResponse.json({
        intent: 'navigate',
        params: { path: '/agency' },
        confirmation: textBlock && textBlock.type === 'text' ? textBlock.text : 'I can help you search locations, navigate the app, or update profiles. What would you like to do?',
        requires_confirm: false,
      })
    }

    const intent = toolBlock.name
    const params = toolBlock.input as Record<string, unknown>

    // Build confirmation message and determine if confirmation is needed
    let confirmation = ''
    let requires_confirm = false

    switch (intent) {
      case 'search_locations': {
        const parts = []
        if (params.query) parts.push(`matching "${params.query}"`)
        if (params.city) parts.push(`in ${params.city}`)
        if (params.state) parts.push(`in ${params.state}`)
        if (params.org_name) parts.push(`for ${params.org_name}`)
        confirmation = `Search locations ${parts.join(' ')}`
        break
      }
      case 'navigate': {
        const dest = params.destination as string
        const path = DESTINATION_PATHS[dest] || '/agency'
        confirmation = `Navigate to ${dest.replace(/_/g, ' ')}`
        // Add resolved path to params
        params.path = path
        break
      }
      case 'show_action_items': {
        const filter = (params.filter as string) || 'all'
        confirmation = `Show ${filter === 'all' ? 'all' : filter} items needing attention`
        break
      }
      case 'bulk_update_profiles': {
        const filter = params.location_filter as Record<string, string> | undefined
        const fields = params.fields as Record<string, string> | undefined
        const filterParts = []
        if (filter?.city) filterParts.push(`in ${filter.city}`)
        if (filter?.state) filterParts.push(`in ${filter.state}`)
        if (filter?.org_name) filterParts.push(`for ${filter.org_name}`)
        const fieldParts = []
        if (fields?.description) fieldParts.push('description')
        if (fields?.phone_primary) fieldParts.push('phone')
        if (fields?.website_uri) fieldParts.push('website')
        confirmation = `Update ${fieldParts.join(', ')} for locations ${filterParts.join(' ')}. This will modify GBP profiles.`
        requires_confirm = true
        break
      }
    }

    return NextResponse.json({
      intent,
      params,
      confirmation,
      requires_confirm,
    })
  } catch (error: any) {
    console.error('AI command error:', error)
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }
}
