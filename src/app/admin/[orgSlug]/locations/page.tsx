import { getOrgBySlug } from '@/lib/org'
import { getOrgLocations } from '@/lib/locations'
import Link from 'next/link'
import type { Location } from '@/lib/types'

export const dynamic = 'force-dynamic'

const TYPE_LABELS: Record<string, string> = {
  place: 'Place',
  practitioner: 'Practitioner',
  service_area: 'Service Area',
}

export default async function LocationsPage({ params }: { params: { orgSlug: string } }) {
  const org = await getOrgBySlug(params.orgSlug)
  const locations = await getOrgLocations(org.id)
  const basePath = `/admin/${params.orgSlug}`

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif text-ink">Locations</h1>
        <Link
          href={`${basePath}/locations/new`}
          className="px-5 py-2 bg-ink hover:bg-ink/90 text-cream text-sm font-medium rounded-full no-underline transition-colors"
        >
          + New Location
        </Link>
      </div>

      <div className="grid gap-4">
        {locations.map((loc: Location) => (
          <Link
            key={loc.id}
            href={`${basePath}/locations/${loc.id}`}
            className="block border border-warm-border rounded-xl p-5 hover:border-ink/30 transition-colors no-underline"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-ink flex items-center justify-center text-cream font-bold text-xs font-mono shrink-0">
                  {loc.name[0]}
                </div>
                <div>
                  <div className="text-sm font-medium text-ink">{loc.name}</div>
                  <div className="text-xs text-warm-gray mt-0.5 flex items-center gap-2">
                    <span className="font-mono text-ink">{TYPE_LABELS[loc.type]}</span>
                    {loc.city && loc.state && (
                      <>
                        <span className="text-warm-border">&middot;</span>
                        <span>{loc.city}, {loc.state}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs">
                {loc.email && <span className="text-warm-gray">{loc.email}</span>}
                <span className={loc.active ? 'text-ink font-medium' : 'text-warm-gray'}>
                  {loc.active ? '● Active' : '○ Inactive'}
                </span>
              </div>
            </div>
          </Link>
        ))}

        {locations.length === 0 && (
          <div className="text-center py-16 text-warm-gray text-sm">
            No locations yet. Add your first location to get started.
          </div>
        )}
      </div>
    </div>
  )
}
