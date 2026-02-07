import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Organization, OrgMember } from '@/lib/types'

/**
 * Get the current org from a slug, verifying the user has access.
 * Redirects to /admin if the org is not found or user lacks access.
 */
export async function getOrgBySlug(slug: string): Promise<Organization> {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  // Fetch org and verify membership in one query
  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role, organizations(*)')
    .eq('user_id', user.id)
    .filter('organizations.slug', 'eq', slug)
    .single()

  if (!membership?.organizations) {
    // User doesn't have access to this org — try falling back
    redirect('/admin')
  }

  return membership.organizations as unknown as Organization
}

/**
 * Get all orgs the current user belongs to.
 */
export async function getUserOrgs(): Promise<(OrgMember & { org: Organization })[]> {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const { data: memberships } = await supabase
    .from('org_members')
    .select('*, organizations(*)')
    .eq('user_id', user.id)
    .order('created_at')

  return (memberships || []).map((m: any) => ({
    ...m,
    org: m.organizations,
  }))
}

/**
 * Get the user's role in a specific org.
 */
export async function getUserRole(orgId: string): Promise<string | null> {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('org_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .single()

  return data?.role || null
}

/**
 * Create a new org and make the current user the owner.
 */
export async function createOrgWithOwner(name: string, slug: string) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  // Insert org
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({ name, slug })
    .select()
    .single()

  if (orgError) return { error: orgError }

  // Owner membership is auto-created by database trigger
  return { data: org }
}
