import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { ChatProvider } from '@/components/chat-context'
import { ChatPane } from '@/components/chat-pane'
import type { Organization, OrgMember } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function AgencyLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/admin/login')

  // Get all user memberships for the sidebar
  const { data: memberships } = await supabase
    .from('org_members')
    .select('*, organizations(*)')
    .eq('user_id', user.id)
    .order('created_at')

  const allMemberships = (memberships || []).map((m: any) => ({
    ...m,
    org: m.organizations as Organization,
  })) as (OrgMember & { org: Organization })[]

  // Must be agency admin
  const isAgencyAdmin = allMemberships.some((m) => m.is_agency_admin)
  if (!isAgencyAdmin) redirect('/admin')

  // Use first org as the "current" for sidebar context
  const currentOrg = allMemberships[0]?.org
  if (!currentOrg) redirect('/admin')

  return (
    <ChatProvider>
      <div className="flex min-h-screen">
        <Sidebar
          currentOrg={currentOrg}
          memberships={allMemberships}
          userEmail={user.email || ''}
          isAgencyAdmin={true}
        />
        <main className="flex-1 min-w-0 p-8">
          {children}
        </main>
        <ChatPane
          orgSlug={currentOrg.slug}
          orgName={currentOrg.name}
          isAgencyAdmin={true}
        />
      </div>
    </ChatProvider>
  )
}
