import { getOrgBySlug } from '@/lib/org'
import { getLocation } from '@/lib/locations'
import { ProfileForm } from '@/components/profile-form'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function NewLocationReviewFunnelPage({
  params,
}: {
  params: { orgSlug: string; locationId: string }
}) {
  const org = await getOrgBySlug(params.orgSlug)
  const location = await getLocation(params.locationId, org.id)
  if (!location) notFound()

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-6">New Review Funnel</h1>
      <p className="text-sm text-warm-gray mb-6">
        For <span className="text-ink font-medium">{location.name}</span>
      </p>
      <ProfileForm
        orgId={org.id}
        orgSlug={params.orgSlug}
        locationId={location.id}
        defaultPlaceId={location.place_id || undefined}
      />
    </div>
  )
}
