import { getOrgBySlug } from '@/lib/org'
import { getLocation, requireAgencyAdmin } from '@/lib/locations'
import { createServerSupabase } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { LanderSettingsForm } from './form'

export const dynamic = 'force-dynamic'

export default async function LanderSettingsPage({
  params,
}: {
  params: { orgSlug: string; locationId: string }
}) {
  await requireAgencyAdmin()

  const org = await getOrgBySlug(params.orgSlug)
  const location = await getLocation(params.locationId, org.id)
  if (!location) notFound()

  const supabase = createServerSupabase()

  // Fetch existing lander (may not exist yet)
  const { data: lander } = await supabase
    .from('local_landers')
    .select('*')
    .eq('location_id', location.id)
    .single()

  // Fetch GBP profile for defaults
  const { data: gbp } = await supabase
    .from('gbp_profiles')
    .select('business_name, description, phone_primary, primary_category_name, website_uri')
    .eq('location_id', location.id)
    .single()

  const basePath = `/admin/${params.orgSlug}/locations/${params.locationId}`

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Link
          href={`/admin/${params.orgSlug}/locations`}
          className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
        >
          Locations
        </Link>
        <span className="text-xs text-warm-gray">/</span>
        <Link
          href={`/admin/${params.orgSlug}/locations/${params.locationId}`}
          className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
        >
          {location.name}
        </Link>
        <span className="text-xs text-warm-gray">/</span>
        <Link
          href={`${basePath}/lander`}
          className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
        >
          Lander
        </Link>
        <span className="text-xs text-warm-gray">/</span>
      </div>

      <h1 className="text-2xl font-serif text-ink mb-6">
        {lander ? 'Lander Settings' : 'Create Lander'}
      </h1>

      <LanderSettingsForm
        orgId={org.id}
        orgSlug={params.orgSlug}
        locationId={location.id}
        locationName={location.name}
        lander={lander}
        gbpDefaults={gbp ? {
          businessName: gbp.business_name,
          description: gbp.description,
          categoryName: gbp.primary_category_name,
        } : null}
      />
    </div>
  )
}
