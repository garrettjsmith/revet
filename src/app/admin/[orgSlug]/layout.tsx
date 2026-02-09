import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import type { Organization, OrgMember, Location } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { orgSlug: string }
}) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/admin/login')

  // Get all user memberships for the org switcher
  const { data: memberships } = await supabase
    .from('org_members')
    .select('*, organizations(*)')
    .eq('user_id', user.id)
    .order('created_at')

  const allMemberships = (memberships || [])
    .filter((m: any) => m.organizations != null)
    .map((m: any) => ({
      ...m,
      org: m.organizations as Organization,
    })) as (OrgMember & { org: Organization })[]

  // Find the current org
  const currentMembership = allMemberships.find(
    (m) => m.org.slug === params.orgSlug
  )

  if (!currentMembership) {
    // User doesn't have access to this org
    redirect('/admin')
  }

  const currentOrg = currentMembership.org
  const isAgencyAdmin = allMemberships.some((m) => m.is_agency_admin)

  // Fetch locations for the current org (for sidebar location selector)
  const { data: orgLocations } = await supabase
    .from('locations')
    .select('id, name, city, state, type')
    .eq('org_id', currentOrg.id)
    .order('name')

  return (
    <div className="flex min-h-screen">
      <Sidebar
        currentOrg={currentOrg}
        memberships={allMemberships}
        userEmail={user.email || ''}
        isAgencyAdmin={isAgencyAdmin}
        locations={(orgLocations || []) as Pick<Location, 'id' | 'name' | 'city' | 'state' | 'type'>[]}
      />
      <main className="flex-1 p-8 max-w-6xl">
        {children}
      </main>
    </div>
  )
}
