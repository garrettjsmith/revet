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
        <h1 className="text-2xl font-serif text-ink">Review Funnels</h1>
        <Link
          href="/admin/profiles/new"
          className="px-5 py-2 bg-ink hover:bg-ink/90 text-cream text-sm font-medium rounded-full no-underline transition-colors"
        >
          + New Profile
        </Link>
      </div>

      <div className="grid gap-4">
        {(profiles || []).map((p: any) => (
          <Link
            key={p.id}
            href={`/admin/profiles/${p.id}`}
            className="block border border-warm-border rounded-xl p-5 hover:border-ink/30 transition-colors no-underline"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-cream font-bold text-xs font-mono"
                  style={{ background: p.primary_color }}
                >
                  {(p.logo_text || p.name)?.[0]}
                </div>
                <div>
                  <div className="text-sm font-medium text-ink">{p.name}</div>
                  <div className="text-xs text-warm-gray mt-0.5">
                    {p.organizations?.name} · <span className="font-mono text-ink">/r/{p.slug}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-warm-gray">{p.manager_email}</span>
                <span className={p.active ? 'text-ink font-medium' : 'text-warm-gray'}>
                  {p.active ? '● Active' : '○ Inactive'}
                </span>
              </div>
            </div>
          </Link>
        ))}

        {(!profiles || profiles.length === 0) && (
          <div className="text-center py-16 text-warm-gray text-sm">
            No review funnel profiles yet. Create one to get started.
          </div>
        )}
      </div>
    </div>
  )
}
