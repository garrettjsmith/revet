import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agency/locations
 * Returns all locations across all organizations (for agency-level mapping UI).
 */
export async function GET() {
  const supabase = createAdminClient()

  const { data: locations } = await supabase
    .from('locations')
    .select('id, org_id, name, place_id, city, state')
    .eq('active', true)
    .order('name')

  return NextResponse.json({ locations: locations || [] })
}
