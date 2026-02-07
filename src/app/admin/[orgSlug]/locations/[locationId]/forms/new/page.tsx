import { createServerSupabase } from '@/lib/supabase/server'
import { getOrgBySlug } from '@/lib/org'
import { getLocation } from '@/lib/locations'
import { FormBuilder } from '@/components/form-builder'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function NewFormPage({
  params,
}: {
  params: { orgSlug: string; locationId: string }
}) {
  const org = await getOrgBySlug(params.orgSlug)
  const location = await getLocation(params.locationId, org.id)
  if (!location) notFound()

  // Fetch org members for alert email dropdown
  const supabase = createServerSupabase()
  const { data: members } = await supabase
    .from('org_members')
    .select('user_id')
    .eq('org_id', org.id)

  // Get emails from auth.users via a join (we have user_ids)
  // Since we can't directly query auth.users from client, pass what we have
  const memberEmails = (members || []).map((m: { user_id: string }) => ({
    email: m.user_id, // Will need resolving — for now use the user_id
  }))

  // For now, don't pass orgMembers and let the input fallback render
  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-6">New Form</h1>
      <p className="text-sm text-warm-gray mb-6">
        For <span className="text-ink font-medium">{location.name}</span>
      </p>
      <FormBuilder
        orgId={org.id}
        orgSlug={params.orgSlug}
        locationId={location.id}
      />
    </div>
  )
}
