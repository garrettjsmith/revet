import { createServerSupabase } from '@/lib/supabase/server'
import { getOrgBySlug } from '@/lib/org'
import { getLocation, checkAgencyAdmin } from '@/lib/locations'
import { getTemplate } from '@/lib/lander-templates'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { GenerateAIContentCard } from './generate-ai-content'

export const dynamic = 'force-dynamic'

export default async function LanderDashboardPage({
  params,
}: {
  params: { orgSlug: string; locationId: string }
}) {
  const org = await getOrgBySlug(params.orgSlug)
  const location = await getLocation(params.locationId, org.id)
  if (!location) notFound()

  const supabase = createServerSupabase()
  const basePath = `/admin/${params.orgSlug}/locations/${params.locationId}`
  const isAgencyAdmin = await checkAgencyAdmin()

  // Fetch lander for this location
  const { data: lander } = await supabase
    .from('local_landers')
    .select('*')
    .eq('location_id', location.id)
    .single()

  // No lander configured yet
  if (!lander) {
    return (
      <div>
        <Breadcrumbs orgSlug={params.orgSlug} locationId={params.locationId} locationName={location.name} />
        <h1 className="text-2xl font-serif text-ink mb-6">Local Lander</h1>
        <div className="text-center py-16 text-warm-gray text-sm">
          No landing page configured for this location.
          {isAgencyAdmin && (
            <div className="mt-4">
              <Link
                href={`${basePath}/lander/settings`}
                className="px-5 py-2 bg-ink hover:bg-ink/90 text-cream text-sm font-medium rounded-full no-underline transition-colors"
              >
                + Create Lander
              </Link>
            </div>
          )}
        </div>
      </div>
    )
  }

  const landerUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://use.revet.app'}/l/${lander.slug}`

  return (
    <div>
      <Breadcrumbs orgSlug={params.orgSlug} locationId={params.locationId} locationName={location.name} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-serif text-ink">Local Lander</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={lander.active ? 'text-xs text-ink font-medium' : 'text-xs text-warm-gray'}>
              {lander.active ? '● Active' : '○ Inactive'}
            </span>
            <span className="text-xs text-warm-gray">·</span>
            <span className="text-xs text-warm-gray">{lander.heading || location.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={landerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2 border border-warm-border text-warm-gray hover:text-ink hover:border-ink text-sm rounded-full no-underline transition-colors"
          >
            View Page
          </a>
          {isAgencyAdmin && (
            <Link
              href={`${basePath}/lander/settings`}
              className="px-5 py-2 border border-warm-border text-warm-gray hover:text-ink hover:border-ink text-sm rounded-full no-underline transition-colors"
            >
              Settings
            </Link>
          )}
        </div>
      </div>

      {/* Page URL */}
      <div className="border border-warm-border rounded-xl p-4 mb-6">
        <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1.5">Page URL</div>
        <code className="text-sm text-ink font-mono break-all">{landerUrl}</code>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <InfoCard label="Template" value={getTemplate(lander.template_id || 'general').label} />
        <InfoCard label="Reviews" value={lander.show_reviews ? 'Shown' : 'Hidden'} />
        <InfoCard label="Map" value={lander.show_map ? 'Shown' : 'Hidden'} />
        <InfoCard label="FAQ" value={lander.show_faq ? 'Shown' : 'Hidden'} />
      </div>

      {/* AI Content */}
      {isAgencyAdmin && (
        <GenerateAIContentCard
          landerId={lander.id}
          generatedAt={lander.ai_content_generated_at}
          hasContent={!!lander.ai_content}
        />
      )}

      {/* Last updated */}
      <div className="border border-warm-border rounded-xl p-4">
        <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Last Updated</div>
        <span className="text-sm text-ink">
          {new Date(lander.updated_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </span>
      </div>
    </div>
  )
}

function Breadcrumbs({ orgSlug, locationId, locationName }: { orgSlug: string; locationId: string; locationName: string }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <Link
        href={`/admin/${orgSlug}/locations`}
        className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
      >
        Locations
      </Link>
      <span className="text-xs text-warm-gray">/</span>
      <Link
        href={`/admin/${orgSlug}/locations/${locationId}`}
        className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
      >
        {locationName}
      </Link>
      <span className="text-xs text-warm-gray">/</span>
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-warm-border rounded-xl p-4">
      <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">{label}</div>
      <div className="text-sm font-medium text-ink">{value}</div>
    </div>
  )
}
