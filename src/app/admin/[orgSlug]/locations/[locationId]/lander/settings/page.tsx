import { getOrgBySlug } from '@/lib/org'
import { getLocation, requireAgencyAdmin } from '@/lib/locations'
import { createServerSupabase } from '@/lib/supabase/server'
import { detectTemplate } from '@/lib/lander-templates'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { LanderSettingsForm } from './form'
import type { LocationType } from '@/lib/types'

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

  // Fetch existing lander + GBP profile in parallel
  const [landerResult, gbpResult] = await Promise.all([
    supabase.from('local_landers').select('*').eq('location_id', location.id).single(),
    supabase.from('gbp_profiles').select('business_name, description, phone_primary, primary_category_id, primary_category_name, website_uri').eq('location_id', location.id).single(),
  ])

  const lander = landerResult.data
  const gbp = gbpResult.data

  // Auto-detect template from GBP category + location type
  const detectedTemplateId = detectTemplate(
    gbp?.primary_category_id || null,
    location.type as LocationType,
  )

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
        detectedTemplateId={detectedTemplateId}
      />
    </div>
  )
}
