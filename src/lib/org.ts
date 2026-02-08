import { cache } from 'react'
import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Organization, OrgMember } from '@/lib/types'

/**
 * Get the current org from a slug, verifying the user has access.
 * Redirects to /admin if the org is not found or user lacks access.
 *
 * Wrapped in React.cache() so multiple calls with the same slug
 * within a single server render share one Supabase round-trip.
 */
export const getOrgBySlug = cache(async (slug: string): Promise<Organization> => {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  // Query org directly by slug, then verify membership.
  // This avoids the PostgREST embedded-filter + .single() footgun
  // that breaks when a user belongs to multiple orgs.
  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!org) redirect('/admin')

  const { data: membership } = await supabase
    .from('org_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('org_id', org.id)
    .single()

  if (!membership) {
    // User doesn't have access to this org
    redirect('/admin')
  }

  return org as Organization
})

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
 * Uses a SECURITY DEFINER RPC to bypass RLS.
 */
export async function createOrgWithOwner(name: string, slug: string) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const { data: orgId, error: rpcError } = await supabase.rpc('create_organization', {
    org_name: name,
    org_slug: slug,
  })

  if (rpcError) return { error: rpcError }

  // Fetch the full org (SELECT policy works now — membership was just created)
  const { data: org, error: fetchError } = await supabase
    .from('organizations')
    .select()
    .eq('id', orgId)
    .single()

  if (fetchError) return { error: fetchError }
  return { data: org }
}
