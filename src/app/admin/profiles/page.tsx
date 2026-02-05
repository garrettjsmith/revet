import { createServerSupabase } from '@/lib/supabase/server'
import Link from 'next/link'
import type { ReviewProfile } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function ProfilesPage() {
  const supabase = createServerSupabase()

  const { data: profiles } = await supabase
    .from('review_profiles')
    .select('*, organizations(name)')
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">Review Funnels</h1>
        <Link
          href="/admin/profiles/new"
          className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold rounded-lg no-underline transition-colors"
        >
          + New Profile
        </Link>
      </div>

      <div className="grid gap-4">
        {(profiles || []).map((p: any) => (
          <Link
            key={p.id}
            href={`/admin/profiles/${p.id}`}
            className="block bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors no-underline"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs font-mono"
                  style={{ background: p.primary_color }}
                >
                  {(p.logo_text || p.name)?.[0]}
                </div>
                <div>
                  <div className="text-sm font-medium text-white">{p.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {p.organizations?.name} · <span className="font-mono text-sky-400">/r/{p.slug}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-gray-500">{p.manager_email}</span>
                <span className={p.active ? 'text-green-400' : 'text-gray-600'}>
                  {p.active ? '● Active' : '○ Inactive'}
                </span>
              </div>
            </div>
          </Link>
        ))}

        {(!profiles || profiles.length === 0) && (
          <div className="text-center py-16 text-gray-500 text-sm">
            No review funnel profiles yet. Create one to get started.
          </div>
        )}
      </div>
    </div>
  )
}
