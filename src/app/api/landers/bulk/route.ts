import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { detectTemplate } from '@/lib/lander-templates'
import type { LocationType } from '@/lib/types'

export const maxDuration = 60

interface BulkCreateRequest {
  org_id: string
  location_ids: string[]
  defaults?: {
    primary_color?: string
    logo_url?: string
    show_reviews?: boolean
    show_map?: boolean
    show_faq?: boolean
  }
}

interface ResultItem {
  location_id: string
  status: 'created' | 'skipped' | 'error'
  slug?: string
  error?: string
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

function generateSlug(name: string, city: string | null): string {
  const base = city ? `${name}-${city}` : name
  return slugify(base)
}

export async function POST(request: NextRequest) {
  // Auth check via user session
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

  const body: BulkCreateRequest = await request.json()
  const { org_id, location_ids, defaults } = body

  if (!org_id || !location_ids || !Array.isArray(location_ids) || location_ids.length === 0) {
    return NextResponse.json({ error: 'Missing org_id or location_ids' }, { status: 400 })
  }

  if (location_ids.length > 200) {
    return NextResponse.json({ error: 'Maximum 200 locations per request' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Pre-fetch in parallel: locations, GBP profiles, existing landers, existing slugs
  const [locationsResult, gbpResult, existingLandersResult, existingSlugsResult] = await Promise.all([
    admin
      .from('locations')
      .select('id, name, city, state, type')
      .eq('org_id', org_id)
      .in('id', location_ids),
    admin
      .from('gbp_profiles')
      .select('location_id, primary_category_id')
      .in('location_id', location_ids),
    admin
      .from('local_landers')
      .select('location_id')
      .in('location_id', location_ids),
    admin
      .from('local_landers')
      .select('slug'),
  ])

  const locations = locationsResult.data || []
  const locationMap = new Map(locations.map((l: any) => [l.id, l]))

  const gbpMap = new Map(
    (gbpResult.data || []).map((g: any) => [g.location_id, g])
  )

  const existingLanderIds = new Set(
    (existingLandersResult.data || []).map((l: any) => l.location_id)
  )

  const usedSlugs = new Set(
    (existingSlugsResult.data || []).map((l: any) => l.slug)
  )

  // Track slugs we create during this batch to avoid self-collisions
  const batchSlugs = new Set<string>()

  function resolveSlug(name: string, city: string | null): string {
    let base = generateSlug(name, city)
    if (!base) base = 'location'

    let candidate = base
    let suffix = 2

    while (usedSlugs.has(candidate) || batchSlugs.has(candidate)) {
      candidate = `${base}-${suffix}`
      suffix++
      if (suffix > 100) {
        // Timestamp fallback for extreme cases
        candidate = `${base}-${Date.now().toString(36).slice(-5)}`
        break
      }
    }

    batchSlugs.add(candidate)
    return candidate
  }

  // Sequential inserts (reliable, avoids race conditions)
  const results: ResultItem[] = []

  for (const locationId of location_ids) {
    // Skip if lander already exists
    if (existingLanderIds.has(locationId)) {
      results.push({ location_id: locationId, status: 'skipped' })
      continue
    }

    const location = locationMap.get(locationId)
    if (!location) {
      results.push({ location_id: locationId, status: 'error', error: 'Location not found' })
      continue
    }

    const gbp = gbpMap.get(locationId)
    const templateId = detectTemplate(
      gbp?.primary_category_id || null,
      (location.type || 'place') as LocationType,
    )

    const slug = resolveSlug(location.name, location.city)

    const { error } = await admin
      .from('local_landers')
      .insert({
        org_id,
        location_id: locationId,
        slug,
        template_id: templateId,
        template_data: {},
        primary_color: defaults?.primary_color || '#1B4965',
        logo_url: defaults?.logo_url || null,
        show_reviews: defaults?.show_reviews ?? true,
        show_map: defaults?.show_map ?? true,
        show_faq: defaults?.show_faq ?? true,
        active: true,
      })

    if (error) {
      if (error.code === '23505') {
        // Unique constraint — slug or location_id collision, try timestamp fallback
        const fallbackSlug = `${slug}-${Date.now().toString(36).slice(-5)}`
        const { error: retryError } = await admin
          .from('local_landers')
          .insert({
            org_id,
            location_id: locationId,
            slug: fallbackSlug,
            template_id: templateId,
            template_data: {},
            primary_color: defaults?.primary_color || '#1B4965',
            logo_url: defaults?.logo_url || null,
            show_reviews: defaults?.show_reviews ?? true,
            show_map: defaults?.show_map ?? true,
            show_faq: defaults?.show_faq ?? true,
            active: true,
          })

        if (retryError) {
          results.push({ location_id: locationId, status: 'skipped' })
        } else {
          results.push({ location_id: locationId, status: 'created', slug: fallbackSlug })
          usedSlugs.add(fallbackSlug)
        }
      } else {
        results.push({ location_id: locationId, status: 'error', error: error.message })
      }
    } else {
      results.push({ location_id: locationId, status: 'created', slug })
      usedSlugs.add(slug)
    }
  }

  const created = results.filter((r) => r.status === 'created').length
  const skipped = results.filter((r) => r.status === 'skipped').length
  const errors = results.filter((r) => r.status === 'error').length

  return NextResponse.json({
    results,
    summary: { created, skipped, errors, total: results.length },
  })
}
