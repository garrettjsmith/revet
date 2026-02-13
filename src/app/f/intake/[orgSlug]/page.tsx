import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { IntakeForm } from '@/components/intake-form'

export const revalidate = 300

export default async function IntakePage({
  params,
  searchParams,
}: {
  params: { orgSlug: string }
  searchParams: { location?: string }
}) {
  const adminClient = createAdminClient()

  // Look up org by slug
  const { data: org } = await adminClient
    .from('organizations')
    .select('id, name, logo_url')
    .eq('slug', params.orgSlug)
    .eq('status', 'active')
    .single()

  if (!org) {
    notFound()
  }

  // Get locations for this org
  const { data: locations } = await adminClient
    .from('locations')
    .select('id, name, city, state, place_id')
    .eq('org_id', org.id)
    .eq('active', true)
    .order('name')

  if (!locations || locations.length === 0) {
    notFound()
  }

  // If location specified in query, use that; otherwise show first (or let user pick)
  const locationId = searchParams.location || (locations.length === 1 ? locations[0].id : null)

  // Check if brand config already exists
  const { data: existingBrand } = await adminClient
    .from('brand_config')
    .select('id, primary_color, logo_url')
    .eq('org_id', org.id)
    .single()

  return (
    <div className="min-h-screen bg-white">
      <IntakeForm
        orgId={org.id}
        orgName={org.name}
        orgLogo={org.logo_url}
        locations={locations}
        preselectedLocationId={locationId}
        existingBrand={existingBrand ? { primaryColor: existingBrand.primary_color, logoUrl: existingBrand.logo_url } : null}
        googlePlacesApiKey={process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || ''}
      />
    </div>
  )
}
