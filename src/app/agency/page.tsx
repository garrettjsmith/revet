import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function AgencyOverview() {
  const supabase = createAdminClient()

  const { data: orgs } = await supabase
    .from('organizations')
    .select('*')
    .order('name')

  const { count: locationCount } = await supabase
    .from('locations')
    .select('*', { count: 'exact', head: true })

  const { count: profileCount } = await supabase
    .from('review_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('active', true)

  const { data: integrations } = await supabase
    .from('agency_integrations')
    .select('*')
    .eq('status', 'connected')

  const organizations = orgs || []
  const activeOrgs = organizations.filter((o: any) => o.status === 'active').length
  const connectedIntegrations = integrations?.length || 0

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-8">Agency Overview</h1>

      {/* Summary stats */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Organizations</div>
          <div className="text-2xl font-bold font-mono text-cream">{organizations.length}</div>
          <div className="text-[10px] text-warm-gray mt-1">{activeOrgs} active</div>
        </div>
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Locations</div>
          <div className="text-2xl font-bold font-mono text-cream">{locationCount || 0}</div>
        </div>
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Active Funnels</div>
          <div className="text-2xl font-bold font-mono text-cream">{profileCount || 0}</div>
        </div>
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Integrations</div>
          <div className="text-2xl font-bold font-mono text-cream">{connectedIntegrations}</div>
        </div>
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Quick Links</div>
          <div className="flex flex-col gap-1 mt-1">
            <Link href="/agency/organizations" className="text-xs text-warm-gray hover:text-cream no-underline transition-colors">
              Manage Orgs
            </Link>
            <Link href="/agency/integrations" className="text-xs text-warm-gray hover:text-cream no-underline transition-colors">
              Integrations
            </Link>
          </div>
        </div>
      </div>

      {/* Recent organizations */}
      <div className="border border-warm-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-warm-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Organizations</h2>
          <Link href="/agency/organizations" className="text-xs text-warm-gray hover:text-ink no-underline transition-colors">
            View all
          </Link>
        </div>
        {organizations.length === 0 ? (
          <div className="p-12 text-center text-warm-gray text-sm">
            No organizations yet.{' '}
            <Link href="/admin/orgs/new" className="text-ink underline hover:no-underline">
              Create your first
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-warm-border">
                {['Organization', 'Status', 'Website', ''].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {organizations.slice(0, 10).map((org: any) => (
                <tr key={org.id} className="border-b border-warm-border/50 hover:bg-warm-light/50">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-ink flex items-center justify-center text-cream text-[10px] font-bold font-mono shrink-0">
                        {org.name[0]}
                      </div>
                      <div className="text-sm font-medium text-ink">{org.name}</div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs text-warm-gray capitalize">{org.status}</span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-warm-gray truncate max-w-[200px]">
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
