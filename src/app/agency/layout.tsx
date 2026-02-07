import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function AgencyLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/admin/login')

  // Check agency admin status
  const { data: adminMembership } = await supabase
    .from('org_members')
    .select('is_agency_admin')
    .eq('user_id', user.id)
    .eq('is_agency_admin', true)
    .limit(1)

  if (!adminMembership || adminMembership.length === 0) {
    redirect('/admin')
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* Agency top bar */}
      <header className="border-b border-warm-border bg-ink">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-sm font-bold text-cream font-mono">AGENCY</span>
            <nav className="flex items-center gap-4">
              <Link
                href="/agency"
                className="text-sm text-warm-gray hover:text-cream no-underline transition-colors"
              >
                Overview
              </Link>
              <Link
                href="/agency/organizations"
                className="text-sm text-warm-gray hover:text-cream no-underline transition-colors"
              >
                Organizations
              </Link>
              <Link
                href="/agency/integrations"
                className="text-sm text-warm-gray hover:text-cream no-underline transition-colors"
              >
                Integrations
              </Link>
            </nav>
          </div>
          <Link
            href="/admin"
            className="text-xs text-warm-gray hover:text-cream no-underline transition-colors"
          >
            Back to Admin
          </Link>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
