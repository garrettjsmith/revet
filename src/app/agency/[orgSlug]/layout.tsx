import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { OrgConfigNav } from '@/components/org-config-nav'

export const dynamic = 'force-dynamic'

export default async function OrgConfigLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { orgSlug: string }
}) {
  // Parent agency layout already verified agency admin status.
  // Use admin client to look up the org (agency admins can configure any org).
  const supabase = createAdminClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('slug', params.orgSlug)
    .single()

  if (!org) redirect('/agency/organizations')

  return (
    <div>
      {/* Org header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Link
            href="/agency/organizations"
            className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
          >
            Organizations
          </Link>
          <span className="text-xs text-warm-gray">/</span>
        </div>
        <div className="flex items-center gap-3 mb-4">
          {org.logo_url ? (
            <img src={org.logo_url} alt="" className="w-8 h-8 rounded-lg object-contain" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-ink flex items-center justify-center text-cream text-xs font-bold font-mono">
              {org.name[0]}
            </div>
          )}
          <h1 className="text-2xl font-serif text-ink">{org.name}</h1>
        </div>
        <OrgConfigNav orgSlug={params.orgSlug} />
      </div>

      {children}
    </div>
  )
}
