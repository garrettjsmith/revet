import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { TeamSettings } from '@/components/team-settings'

export const dynamic = 'force-dynamic'

export default async function OrgTeamConfigPage({
  params,
}: {
  params: { orgSlug: string }
}) {
  const supabase = createAdminClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', params.orgSlug)
    .single()

  if (!org) redirect('/agency/organizations')

  return <TeamSettings orgId={org.id} />
}
