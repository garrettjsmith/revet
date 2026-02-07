import { createServerSupabase } from '@/lib/supabase/server'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function AgencyDashboard() {
  const supabase = createServerSupabase()

  // Get all organizations (agency admin sees all via RLS)
  const { data: orgs } = await supabase
    .from('organizations')
    .select('*')
    .order('name')

  // Get all locations count
  const { count: locationCount } = await supabase
    .from('locations')
    .select('*', { count: 'exact', head: true })

  // Get all active profiles count
  const { count: profileCount } = await supabase
    .from('review_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('active', true)

  const organizations = orgs || []

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-8">Agency Overview</h1>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Organizations</div>
          <div className="text-2xl font-bold font-mono text-cream">{organizations.length}</div>
        </div>
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Locations</div>
          <div className="text-2xl font-bold font-mono text-cream">{locationCount || 0}</div>
        </div>
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Active Funnels</div>
          <div className="text-2xl font-bold font-mono text-cream">{profileCount || 0}</div>
        </div>
      </div>

      {/* Organizations list */}
      <div className="border border-warm-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-warm-border">
          <h2 className="text-sm font-semibold text-ink">All Organizations</h2>
        </div>
        {organizations.length === 0 ? (
          <div className="p-12 text-center text-warm-gray text-sm">
            No organizations yet.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-warm-border">
                {['Organization', 'Slug', 'Website', ''].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {organizations.map((org: any) => (
                <tr key={org.id} className="border-b border-warm-border/50 hover:bg-warm-light/50">
                  <td className="px-5 py-3.5">
                    <div className="text-sm font-medium text-ink">{org.name}</div>
                  </td>
                  <td className="px-5 py-3.5">
                    <code className="text-xs text-ink font-mono">{org.slug}</code>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-warm-gray">
                    {org.website || '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/admin/${org.slug}`}
                      className="text-xs text-warm-gray hover:text-ink no-underline"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
