import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgBySlug } from '@/lib/org'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function OrgLandersPage({
  params,
}: {
  params: { orgSlug: string }
}) {
  const org = await getOrgBySlug(params.orgSlug)
  if (!org) notFound()

  const adminClient = createAdminClient()

  const { data: landers } = await adminClient
    .from('local_landers')
    .select('id, slug, heading, active, location_id, created_at')
    .eq('org_id', org.id)
    .order('created_at', { ascending: false })

  // Fetch location names
  const locationIds = Array.from(new Set((landers || []).map((l: any) => l.location_id)))
  let locationMap = new Map<string, { name: string; city: string | null; state: string | null }>()
  if (locationIds.length > 0) {
    const { data: locations } = await adminClient
      .from('locations')
      .select('id, name, city, state')
      .in('id', locationIds)
    for (const l of locations || []) {
      locationMap.set(l.id, { name: l.name, city: l.city, state: l.state })
    }
  }

  const activeCount = (landers || []).filter((l: any) => l.active).length

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-6">Landers</h1>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="border border-warm-border rounded-xl p-4">
          <div className="text-xs text-warm-gray mb-1">Total Landers</div>
          <div className="text-2xl font-serif text-ink">{(landers || []).length}</div>
        </div>
        <div className="border border-warm-border rounded-xl p-4">
          <div className="text-xs text-warm-gray mb-1">Active</div>
          <div className="text-2xl font-serif text-emerald-600">{activeCount}</div>
        </div>
      </div>

      {(landers || []).length === 0 ? (
        <div className="text-center py-16 text-sm text-warm-gray">
          No landers created yet. Landers are generated through the setup pipeline.
        </div>
      ) : (
        <div className="border border-warm-border rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-warm-border bg-warm-light/30">
                <th className="text-left px-4 py-3 font-medium text-warm-gray">Location</th>
                <th className="text-left px-4 py-3 font-medium text-warm-gray">Slug</th>
                <th className="text-center px-3 py-3 font-medium text-warm-gray">Status</th>
                <th className="text-right px-4 py-3 font-medium text-warm-gray"></th>
              </tr>
            </thead>
            <tbody>
              {(landers || []).map((lander: any) => {
                const loc = locationMap.get(lander.location_id)
                return (
                  <tr key={lander.id} className="border-b border-warm-border/50 last:border-0 hover:bg-warm-light/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{loc?.name || 'Unknown'}</div>
                      {loc?.city && (
                        <div className="text-[10px] text-warm-gray mt-0.5">
                          {[loc.city, loc.state].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/l/${lander.slug}`}
                        className="font-mono text-warm-gray hover:text-ink no-underline"
                        target="_blank"
                      >
                        /l/{lander.slug}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {lander.active ? (
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Active</span>
                      ) : (
                        <span className="text-[10px] text-warm-gray bg-warm-light px-2 py-0.5 rounded-full">Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/${params.orgSlug}/locations/${lander.location_id}/lander`}
                        className="text-xs text-warm-gray hover:text-ink no-underline"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
