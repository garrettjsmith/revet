import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgBySlug } from '@/lib/org'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function OrgReviewFunnelsPage({
  params,
}: {
  params: { orgSlug: string }
}) {
  const org = await getOrgBySlug(params.orgSlug)
  if (!org) notFound()

  const adminClient = createAdminClient()

  // Fetch review profiles (funnels) for this org
  const { data: profiles } = await adminClient
    .from('review_profiles')
    .select('id, slug, name, active, location_id, review_count, created_at')
    .eq('org_id', org.id)
    .order('created_at', { ascending: false })

  // Fetch location names
  const locationIds = Array.from(new Set((profiles || []).map((p: any) => p.location_id).filter(Boolean)))
  let locationMap = new Map<string, string>()
  if (locationIds.length > 0) {
    const { data: locations } = await adminClient
      .from('locations')
      .select('id, name')
      .in('id', locationIds)
    for (const l of locations || []) {
      locationMap.set(l.id, l.name)
    }
  }

  const activeCount = (profiles || []).filter((p: any) => p.active).length

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-6">Funnels</h1>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="border border-warm-border rounded-xl p-4">
          <div className="text-xs text-warm-gray mb-1">Total Funnels</div>
          <div className="text-2xl font-serif text-ink">{(profiles || []).length}</div>
        </div>
        <div className="border border-warm-border rounded-xl p-4">
          <div className="text-xs text-warm-gray mb-1">Active</div>
          <div className="text-2xl font-serif text-emerald-600">{activeCount}</div>
        </div>
      </div>

      {(profiles || []).length === 0 ? (
        <div className="text-center py-16 text-sm text-warm-gray">
          No review funnels created yet. Create funnels from a location's detail page.
        </div>
      ) : (
        <div className="border border-warm-border rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-warm-border bg-warm-light/30">
                <th className="text-left px-4 py-3 font-medium text-warm-gray">Name</th>
                <th className="text-left px-4 py-3 font-medium text-warm-gray">Location</th>
                <th className="text-center px-3 py-3 font-medium text-warm-gray">Reviews</th>
                <th className="text-center px-3 py-3 font-medium text-warm-gray">Status</th>
                <th className="text-right px-4 py-3 font-medium text-warm-gray"></th>
              </tr>
            </thead>
            <tbody>
              {(profiles || []).map((profile: any) => (
                <tr key={profile.id} className="border-b border-warm-border/50 last:border-0 hover:bg-warm-light/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{profile.name || profile.slug}</div>
                    <Link
                      href={`/r/${profile.slug}`}
                      className="text-[10px] font-mono text-warm-gray hover:text-ink no-underline"
                      target="_blank"
                    >
                      /r/{profile.slug}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-warm-gray">
                    {profile.location_id ? locationMap.get(profile.location_id) || 'Unknown' : '--'}
                  </td>
                  <td className="px-3 py-3 text-center text-ink font-mono">
                    {profile.review_count || 0}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {profile.active ? (
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Active</span>
                    ) : (
                      <span className="text-[10px] text-warm-gray bg-warm-light px-2 py-0.5 rounded-full">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {profile.location_id && (
                      <Link
                        href={`/admin/${params.orgSlug}/locations/${profile.location_id}/review-funnels/${profile.id}`}
                        className="text-xs text-warm-gray hover:text-ink no-underline"
                      >
                        Edit
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
