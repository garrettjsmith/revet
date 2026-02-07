import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function AdminIndexPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/admin/login')

  // Get user's org memberships
  const { data: memberships } = await supabase
    .from('org_members')
    .select('org_id, organizations(slug)')
    .eq('user_id', user.id)
    .order('created_at')
    .limit(1)

  const firstOrg = memberships?.[0]?.organizations as any

  // If user has an org, redirect to it
  if (firstOrg?.slug) {
    redirect(`/admin/${firstOrg.slug}`)
  }

  // No orgs — show onboarding
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4 relative">
      <div className="absolute inset-0 blueprint-grid pointer-events-none" />
      <div className="text-center relative z-10 max-w-md">
        <div className="inline-flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-lg bg-ink flex items-center justify-center font-bold text-sm text-cream font-mono">
            LS
          </div>
          <span className="text-2xl font-serif tracking-tight">lseo.app</span>
        </div>
        <h1 className="text-3xl font-serif text-ink mb-3 text-balance">Welcome to lseo.app</h1>
        <p className="text-warm-gray text-sm mb-8 leading-relaxed">
          Create your first organization to get started. Organizations hold all your tools,
          review funnels, and team members.
        </p>
        <Link
          href="/admin/orgs/new"
          className="inline-flex px-6 py-3 bg-ink hover:bg-ink/90 text-cream text-sm font-medium rounded-full no-underline transition-colors"
        >
          Create Organization
        </Link>
      </div>
    </div>
  )
}
