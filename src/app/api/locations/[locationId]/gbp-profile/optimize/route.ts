import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAgencyAdmin } from '@/lib/locations'
import { generateProfileDescription, suggestCategories } from '@/lib/ai/profile-optimize'
import type { GBPProfile } from '@/lib/types'

/**
 * POST /api/locations/[locationId]/gbp-profile/optimize
 *
 * Generates AI suggestions for a specific profile field.
 * Agency admin only.
 *
 * Body: { field: 'description' | 'categories' }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 500 })
  }

  const body = await request.json()
  const { field } = body

  if (!field || !['description', 'categories'].includes(field)) {
    return NextResponse.json({ error: 'Invalid field' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Fetch profile + location data
  const { data: profile } = await adminClient
    .from('gbp_profiles')
    .select('*')
    .eq('location_id', params.locationId)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'No GBP profile found' }, { status: 404 })
  }

  const gbp = profile as GBPProfile

  const { data: location } = await adminClient
    .from('locations')
    .select('name, city, state')
    .eq('id', params.locationId)
    .single()

  try {
    if (field === 'description') {
      // Extract service names from service_items
      const services = (gbp.service_items || [])
        .map((s: any) => {
          const freeLabel = s.freeFormServiceItem?.label
          return s.structuredServiceItem?.description || (typeof freeLabel === 'object' ? freeLabel?.displayName : freeLabel) || ''
        })
        .filter(Boolean)

      const suggestion = await generateProfileDescription({
        businessName: gbp.business_name || location?.name || '',
        category: gbp.primary_category_name,
        city: location?.city || null,
        state: location?.state || null,
        services,
        currentDescription: gbp.description,
      })

      return NextResponse.json({ suggestion })
    }

    if (field === 'categories') {
      const currentCategories = [
        gbp.primary_category_name,
        ...(gbp.additional_categories || []).map((c) => c.displayName),
      ].filter(Boolean) as string[]

      const services = (gbp.service_items || [])
        .map((s: any) => {
          const freeLabel = s.freeFormServiceItem?.label
          return s.structuredServiceItem?.description || (typeof freeLabel === 'object' ? freeLabel?.displayName : freeLabel) || ''
        })
        .filter(Boolean)

      const suggestions = await suggestCategories({
        businessName: gbp.business_name || location?.name || '',
        currentCategories,
        services,
      })

      return NextResponse.json({ suggestions })
    }
  } catch (err) {
    console.error('[gbp-profile/optimize] AI generation failed:', err)
    return NextResponse.json({ error: 'AI generation failed' }, { status: 500 })
  }

  return NextResponse.json({ error: 'Unknown field' }, { status: 400 })
}
