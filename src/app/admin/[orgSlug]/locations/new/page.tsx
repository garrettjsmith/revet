import { getOrgBySlug } from '@/lib/org'
import { LocationForm } from '@/components/location-form'

export const dynamic = 'force-dynamic'

export default async function NewLocationPage({ params }: { params: { orgSlug: string } }) {
  const org = await getOrgBySlug(params.orgSlug)

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-6">New Location</h1>
      <LocationForm orgId={org.id} orgSlug={params.orgSlug} />
    </div>
  )
}
