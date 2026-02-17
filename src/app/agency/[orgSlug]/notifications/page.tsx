import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { NotificationSettings } from '@/components/notification-settings'

export const dynamic = 'force-dynamic'

export default async function OrgNotificationConfigPage({
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

  return <NotificationSettings orgId={org.id} />
}
