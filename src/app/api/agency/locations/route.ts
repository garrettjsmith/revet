import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAgencyAdmin } from '@/lib/locations'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agency/locations
 * Returns all locations across all organizations (for agency-level mapping UI).
 */
export async function GET() {
  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const supabase = createAdminClient()

  const { data: locations } = await supabase
    .from('locations')
    .select('id, org_id, name, place_id, city, state, status, active')
    .order('name')

  // Filter out archived — use status if available, fall back to active boolean
  const filtered = (locations || []).filter((loc: any) => {
    if (loc.status) return loc.status !== 'archived'
    return loc.active !== false
  })

  return NextResponse.json({ locations: filtered })
}
