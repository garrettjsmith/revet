import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const STATUS_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  active:  { label: 'Active',  dot: 'bg-emerald-500', text: 'text-ink' },
  lead:    { label: 'Lead',    dot: 'bg-blue-400',    text: 'text-blue-600' },
  paused:  { label: 'Paused',  dot: 'bg-amber-400',   text: 'text-amber-600' },
  churned: { label: 'Churned', dot: 'bg-red-400',     text: 'text-red-500' },
}

export default async function AgencyOrganizationsPage() {
  const supabase = createAdminClient()

  // Fetch all orgs
  const { data: orgs } = await supabase
    .from('organizations')
    .select('*')
    .order('name')

  // Fetch location counts per org
  const { data: locations } = await supabase
    .from('locations')
    .select('org_id')

  // Fetch member counts per org
  const { data: members } = await supabase
    .from('org_members')
    .select('org_id')

  // Fetch active profile counts per org
  const { data: profiles } = await supabase
    .from('review_profiles')
    .select('org_id')
    .eq('active', true)

  const organizations = orgs || []

  // Build count maps
  const locationCountMap: Record<string, number> = {}
  ;(locations || []).forEach((l: any) => {
    locationCountMap[l.org_id] = (locationCountMap[l.org_id] || 0) + 1
  })

  const memberCountMap: Record<string, number> = {}
  ;(members || []).forEach((m: any) => {
    memberCountMap[m.org_id] = (memberCountMap[m.org_id] || 0) + 1
  })

  const profileCountMap: Record<string, number> = {}
  ;(profiles || []).forEach((p: any) => {
    profileCountMap[p.org_id] = (profileCountMap[p.org_id] || 0) + 1
  })

  // Summary stats
  const activeCount = organizations.filter((o: any) => o.status === 'active').length
  const leadCount = organizations.filter((o: any) => o.status === 'lead').length
  const totalLocations = locations?.length || 0

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-serif text-ink">Organizations</h1>
        <Link
          href="/admin/orgs/new"
          className="px-5 py-2 bg-ink hover:bg-ink/90 text-cream text-sm font-medium rounded-full no-underline transition-colors"
        >
          + New Organization
        </Link>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Total Orgs</div>
          <div className="text-2xl font-bold font-mono text-cream">{organizations.length}</div>
        </div>
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Active</div>
          <div className="text-2xl font-bold font-mono text-cream">{activeCount}</div>
        </div>
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Leads</div>
          <div className="text-2xl font-bold font-mono text-cream">{leadCount}</div>
        </div>
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Total Locations</div>
          <div className="text-2xl font-bold font-mono text-cream">{totalLocations}</div>
        </div>
      </div>

      {/* Organizations table */}
      <div className="border border-warm-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-warm-border">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">All Organizations</h2>
            <div className="text-xs text-warm-gray">{organizations.length} total</div>
          </div>
        </div>
        {organizations.length === 0 ? (
          <div className="p-12 text-center text-warm-gray text-sm">
            No organizations yet.{' '}
            <Link href="/admin/orgs/new" className="text-ink underline hover:no-underline">
              Create your first organization
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-warm-border">
                  {['Organization', 'Status', 'Website', 'Locations', 'Members', 'Active Funnels', 'Created', ''].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {organizations.map((org: any) => {
                  const status = STATUS_CONFIG[org.status] || STATUS_CONFIG.active
                  const locCount = locationCountMap[org.id] || 0
                  const memCount = memberCountMap[org.id] || 0
                  const profCount = profileCountMap[org.id] || 0

                  return (
                    <tr key={org.id} className="border-b border-warm-border/50 hover:bg-warm-light/50">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          {org.logo_url ? (
                            <img src={org.logo_url} alt="" className="w-8 h-8 rounded-lg object-contain" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-ink flex items-center justify-center text-cream text-xs font-bold font-mono shrink-0">
                              {org.name[0]}
                            </div>
                          )}
                          <div>
                            <div className="text-sm font-medium text-ink">{org.name}</div>
                            <div className="text-xs text-warm-gray font-mono">{org.slug}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs ${status.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                          {status.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-warm-gray max-w-[200px] truncate">
                        {org.website || '—'}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-sm text-ink">{locCount}</td>
                      <td className="px-5 py-3.5 font-mono text-sm text-ink">{memCount}</td>
                      <td className="px-5 py-3.5 font-mono text-sm text-ink">{profCount}</td>
                      <td className="px-5 py-3.5 text-xs text-warm-gray whitespace-nowrap">
                        {new Date(org.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/admin/${org.slug}`}
                          className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
                        >
                          Manage
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
    </div>
  )
}
