import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agency/organizations
 * Returns all organizations (for agency-level UI components).
 */
export async function GET() {
  const supabase = createAdminClient()

  const { data: organizations } = await supabase
    .from('organizations')
    .select('id, name, slug')
    .eq('status', 'active')
    .order('name')

  return NextResponse.json({ organizations: organizations || [] })
}
