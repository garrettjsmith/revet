import { getOrgBySlug } from '@/lib/org'
import { ProfileForm } from '@/components/profile-form'

export const dynamic = 'force-dynamic'

export default async function NewReviewFunnelPage({ params }: { params: { orgSlug: string } }) {
  const org = await getOrgBySlug(params.orgSlug)

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-6">New Review Funnel</h1>
      <ProfileForm orgId={org.id} orgSlug={params.orgSlug} />
    </div>
  )
}
