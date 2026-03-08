import { getOrgBySlug } from '@/lib/org'
import { getLocation } from '@/lib/locations'
import { createAdminClient } from '@/lib/supabase/admin'
import { IntakeForm } from '@/components/intake-form'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function IntakePage({
  params,
  searchParams,
}: {
  params: { orgSlug: string; locationId: string }
  searchParams: { returnTo?: string }
}) {
  const org = await getOrgBySlug(params.orgSlug)
  const location = await getLocation(params.locationId, org.id)
  if (!location) notFound()

  const adminClient = createAdminClient()

  // Load existing brand config
  const { data: existingBrand } = await adminClient
    .from('brand_config')
    .select('primary_color, logo_url')
    .eq('org_id', org.id)
    .single()

  // Load existing intake data from location
  const { data: locationData } = await adminClient
    .from('locations')
    .select('intake_data, intake_completed_at')
    .eq('id', location.id)
    .single()

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-6">Intake Form</h1>
      <p className="text-sm text-warm-gray mb-6">
        Fill out this form to provide your business details for profile optimization.
        {locationData?.intake_completed_at && (
          <span className="ml-2 text-emerald-600 font-medium">
            Previously submitted {new Date(locationData.intake_completed_at).toLocaleDateString()}
          </span>
        )}
      </p>
      <IntakeForm
        orgId={org.id}
        orgName={org.name}
        orgLogo={org.logo_url}
        locations={[{
          id: location.id,
          name: location.name,
          city: location.city,
          state: location.state,
          place_id: location.place_id ?? null,
        }]}
        preselectedLocationId={location.id}
        existingBrand={existingBrand ? { primaryColor: existingBrand.primary_color, logoUrl: existingBrand.logo_url } : null}
        existingIntakeData={locationData?.intake_data ?? null}
        googlePlacesApiKey={process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || ''}
        returnTo={searchParams.returnTo === 'setup' ? `/admin/${params.orgSlug}/locations/${params.locationId}/setup` : undefined}
      />
    </div>
  )
}
