import { createServerSupabase } from '@/lib/supabase/server'
import { getOrgBySlug } from '@/lib/org'
import { ProfileForm } from '@/components/profile-form'
import { notFound } from 'next/navigation'
import type { ReviewProfile } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function EditReviewFunnelPage({
  params,
}: {
  params: { orgSlug: string; id: string }
}) {
  const org = await getOrgBySlug(params.orgSlug)
  const supabase = createServerSupabase()

  const { data: profile } = await supabase
    .from('review_profiles')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', org.id)
    .single()

  if (!profile) notFound()

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-6">
        Edit: {profile.name}
      </h1>
      <ProfileForm
        profile={profile as ReviewProfile}
        orgId={org.id}
        orgSlug={params.orgSlug}
      />
    </div>
  )
}
