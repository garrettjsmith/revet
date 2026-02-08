import { getOrgBySlug } from '@/lib/org'
import { getLocation, checkAgencyAdmin } from '@/lib/locations'
import { LocationForm } from '@/components/location-form'
import { LocationMoveSection } from '@/components/location-move-section'
import { notFound } from 'next/navigation'
import type { Location } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function LocationSettingsPage({
  params,
}: {
  params: { orgSlug: string; locationId: string }
}) {
  const org = await getOrgBySlug(params.orgSlug)
  const location = await getLocation(params.locationId, org.id)
  if (!location) notFound()

  const isAgencyAdmin = await checkAgencyAdmin()

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-6">
        Edit: {location.name}
      </h1>
      <LocationMoveSection
        locationId={location.id}
        locationName={location.name}
        currentOrgId={org.id}
        currentOrgName={org.name}
        isAgencyAdmin={isAgencyAdmin}
      />
      <LocationForm
        location={location as Location}
        orgId={org.id}
        orgSlug={params.orgSlug}
      />
    </div>
  )
}
