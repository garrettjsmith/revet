import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Organization } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function OrgsPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/admin/login')

  const { data: memberships } = await supabase
    .from('org_members')
    .select('role, organizations(*)')
    .eq('user_id', user.id)
    .order('created_at')

  const orgs = (memberships || []).map((m: any) => ({
    ...m.organizations as Organization,
    role: m.role,
  }))

  return (
    <div className="min-h-screen bg-cream p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-serif text-ink">Organizations</h1>
          <Link
            href="/admin/orgs/new"
            className="px-5 py-2 bg-ink hover:bg-ink/90 text-cream text-sm font-medium rounded-full no-underline transition-colors"
          >
            + New Organization
          </Link>
        </div>

        <div className="grid gap-4">
          {orgs.map((org: any) => (
            <Link
              key={org.id}
              href={`/admin/${org.slug}`}
              className="block border border-warm-border rounded-xl p-5 hover:border-ink/30 transition-colors no-underline"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {org.logo_url ? (
                    <img src={org.logo_url} alt="" className="w-10 h-10 rounded-lg object-contain" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-ink flex items-center justify-center text-cream font-bold text-xs font-mono">
                      {org.name[0]}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-medium text-ink">{org.name}</div>
                    <div className="text-xs text-warm-gray mt-0.5">
                      {org.website || org.slug}
                    </div>
                  </div>
                </div>
                <span className="pill-dashed text-xs">{org.role}</span>
              </div>
            </Link>
          ))}

          {orgs.length === 0 && (
            <div className="text-center py-16 text-warm-gray text-sm">
              No organizations yet.{' '}
              <Link href="/admin/orgs/new" className="text-ink underline hover:no-underline">
                Create your first organization
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
