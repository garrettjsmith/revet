import { getOrgBySlug } from '@/lib/org'
import { getLocation, checkAgencyAdmin } from '@/lib/locations'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { AutopilotForm } from '@/components/autopilot-form'

export const dynamic = 'force-dynamic'

export default async function AutopilotPage({
  params,
}: {
  params: { orgSlug: string; locationId: string }
}) {
  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) redirect(`/admin/${params.orgSlug}`)

  const org = await getOrgBySlug(params.orgSlug)
  const location = await getLocation(params.locationId, org.id)
  if (!location) notFound()

  const basePath = `/admin/${params.orgSlug}/locations/${params.locationId}`

  const supabase = createAdminClient()
  const { data: config } = await supabase
    .from('review_autopilot_config')
    .select('*')
    .eq('location_id', params.locationId)
    .single()

  const defaults = {
    location_id: params.locationId,
    enabled: false,
    auto_reply_ratings: [4, 5],
    tone: 'professional and friendly',
    business_context: null,
    delay_min_minutes: 30,
    delay_max_minutes: 180,
    require_approval: false,
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Link
            href={`/admin/${params.orgSlug}/locations`}
            className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
          >
            Locations
          </Link>
          <span className="text-xs text-warm-gray">/</span>
          <Link
            href={basePath}
            className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
          >
            {location.name}
          </Link>
          <span className="text-xs text-warm-gray">/</span>
          <Link
            href={`${basePath}/reviews`}
            className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
          >
            Reviews
          </Link>
          <span className="text-xs text-warm-gray">/</span>
        </div>
        <h1 className="text-2xl font-serif text-ink">Review Autopilot</h1>
        <p className="text-sm text-warm-gray mt-1">
          Configure AI-powered automatic review replies for {location.name}
        </p>
      </div>

      <div className="border border-warm-border rounded-xl p-6 max-w-2xl">
        <AutopilotForm config={config || defaults} />
      </div>
    </div>
  )
}
