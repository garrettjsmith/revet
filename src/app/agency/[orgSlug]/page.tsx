import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function OrgConfigOverview({
  params,
}: {
  params: { orgSlug: string }
}) {
  const supabase = createAdminClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('slug', params.orgSlug)
    .single()

  if (!org) redirect('/agency/organizations')

  // Fetch counts in parallel
  const [
    { count: locationCount },
    { count: memberCount },
    { count: profileCount },
    { data: brandConfig },
  ] = await Promise.all([
    supabase.from('locations').select('*', { count: 'exact', head: true }).eq('org_id', org.id),
    supabase.from('org_members').select('*', { count: 'exact', head: true }).eq('org_id', org.id),
    supabase.from('review_profiles').select('*', { count: 'exact', head: true }).eq('org_id', org.id).eq('active', true),
    supabase.from('brand_config').select('id, brand_voice, primary_color').eq('org_id', org.id).single(),
  ])

  const hasBrandConfig = !!brandConfig?.brand_voice || !!brandConfig?.primary_color

  return (
    <div>
      {/* Org details */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Locations</div>
          <div className="text-2xl font-bold font-mono text-cream">{locationCount || 0}</div>
        </div>
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Members</div>
          <div className="text-2xl font-bold font-mono text-cream">{memberCount || 0}</div>
        </div>
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Active Funnels</div>
          <div className="text-2xl font-bold font-mono text-cream">{profileCount || 0}</div>
        </div>
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Brand</div>
          <div className="text-2xl font-bold font-mono text-cream">{hasBrandConfig ? 'Set' : '---'}</div>
        </div>
      </div>

      {/* Info card */}
      <div className="border border-warm-border rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-warm-border">
          <h2 className="text-sm font-semibold text-ink">Organization Details</h2>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-warm-gray">Slug</span>
            <span className="text-sm text-ink font-mono">{org.slug}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-warm-gray">Website</span>
            <span className="text-sm text-ink">{org.website || '---'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-warm-gray">Status</span>
            <span className="inline-flex items-center gap-1.5 text-sm text-ink">
              <span className={`w-1.5 h-1.5 rounded-full ${org.status === 'active' ? 'bg-emerald-500' : 'bg-warm-border'}`} />
              {org.status === 'active' ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-warm-gray">Created</span>
            <span className="text-sm text-ink">{new Date(org.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Config quick links */}
      <div className="border border-warm-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-warm-border">
          <h2 className="text-sm font-semibold text-ink">Configuration</h2>
        </div>
        <div className="divide-y divide-warm-border/50">
          <Link
            href={`/agency/${params.orgSlug}/brand`}
            className="flex items-center justify-between px-5 py-4 hover:bg-warm-light/50 transition-colors no-underline group"
          >
            <div>
              <div className="text-sm font-medium text-ink">Brand</div>
              <div className="text-xs text-warm-gray mt-0.5">
                Voice, colors, and design style for AI-generated content
              </div>
            </div>
            <span className="text-xs text-warm-gray group-hover:text-ink transition-colors">
              {hasBrandConfig ? 'Edit' : 'Set up'}
            </span>
          </Link>
        </div>
      </div>
    </div>
  )
}
