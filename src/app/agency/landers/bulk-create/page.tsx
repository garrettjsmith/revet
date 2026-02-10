import { createAdminClient } from '@/lib/supabase/admin'
import { requireAgencyAdmin } from '@/lib/locations'
import { detectTemplate } from '@/lib/lander-templates'
import { BulkLanderWizard } from '@/components/bulk-lander-wizard'
import { BulkCreateLoader } from './loader'
import type { LocationType } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function BulkCreateLandersPage({
  searchParams,
}: {
  searchParams: { ids?: string; org_id?: string }
}) {
  await requireAgencyAdmin()

  // If no IDs in URL params, render client loader that reads from sessionStorage
  if (!searchParams.ids) {
    return <BulkCreateLoader />
  }

  const locationIds = searchParams.ids.split(',').filter(Boolean)
  if (locationIds.length === 0) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-serif text-ink mb-4">Bulk Create Landers</h1>
        <p className="text-sm text-warm-gray">No locations selected. Go back to select locations.</p>
      </div>
    )
  }

  const admin = createAdminClient()

  // Fetch location data, GBP profiles, and existing landers in parallel
  const [locationsResult, gbpResult, landersResult] = await Promise.all([
    admin
      .from('locations')
      .select('id, name, city, state, type, org_id, organizations!inner(id, name, slug)')
      .in('id', locationIds),
    admin
      .from('gbp_profiles')
      .select('location_id, primary_category_id')
      .in('location_id', locationIds),
    admin
      .from('local_landers')
      .select('location_id')
      .in('location_id', locationIds),
  ])

  const gbpMap = new Map(
    (gbpResult.data || []).map((g: any) => [g.location_id, g])
  )

  const existingLanderIds = new Set(
    (landersResult.data || []).map((l: any) => l.location_id)
  )

  // Determine org from the first location
  const firstLoc = (locationsResult.data || [])[0] as any
  const orgId = searchParams.org_id || firstLoc?.organizations?.id || firstLoc?.org_id || ''
  const orgName = firstLoc?.organizations?.name || 'Organization'

  const locations = (locationsResult.data || []).map((loc: any) => {
    const org = loc.organizations as any
    const gbp = gbpMap.get(loc.id)
    const templateId = detectTemplate(
      gbp?.primary_category_id || null,
      (loc.type || 'place') as LocationType,
    )

    return {
      id: loc.id,
      name: loc.name,
      city: loc.city,
      state: loc.state,
      orgId: org?.id || loc.org_id,
      orgName: org?.name || 'Unknown',
      hasLander: existingLanderIds.has(loc.id),
      gbpCategoryId: gbp?.primary_category_id || null,
      templateId,
    }
  })

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-serif text-ink">Bulk Create Landers</h1>
        <p className="text-sm text-warm-gray mt-1">
          Create landing pages for {locations.length} locations in {orgName}.
        </p>
      </div>

      <BulkLanderWizard
        locations={locations}
        orgId={orgId}
        orgName={orgName}
      />
    </div>
  )
}
