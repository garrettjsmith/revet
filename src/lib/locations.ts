import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Location } from '@/lib/types'

/**
 * Get all locations for an org that the current user can access.
 */
export async function getOrgLocations(orgId: string): Promise<Location[]> {
  const supabase = createServerSupabase()
  const { data } = await supabase
    .from('locations')
    .select('*')
    .eq('org_id', orgId)
    .order('name')

  return (data || []) as Location[]
}

/**
 * Get a single location by ID, verifying the user has access.
 */
export async function getLocation(locationId: string, orgId: string): Promise<Location | null> {
  const supabase = createServerSupabase()
  const { data } = await supabase
    .from('locations')
    .select('*')
    .eq('id', locationId)
    .eq('org_id', orgId)
    .single()

  return data as Location | null
}

/**
 * Check if the current user is an agency admin.
 */
export async function checkAgencyAdmin(): Promise<boolean> {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data } = await supabase
    .from('org_members')
    .select('is_agency_admin')
    .eq('user_id', user.id)
    .eq('is_agency_admin', true)
    .limit(1)

  return (data && data.length > 0) || false
}

/**
 * Require agency admin access. Redirects to /admin if not authorized.
 */
export async function requireAgencyAdmin(): Promise<void> {
  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) redirect('/admin')
}
