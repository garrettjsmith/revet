import { createServerSupabase } from '@/lib/supabase/server'
import { AdminNav } from '@/components/admin-nav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  // Login page gets rendered without the nav shell
  if (!user) return <>{children}</>

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      <AdminNav userEmail={user.email || ''} />
      <main className="max-w-6xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
