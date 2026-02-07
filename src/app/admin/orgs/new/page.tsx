'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function NewOrgPage() {
  const router = useRouter()
  const supabase = createClient()

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    slug: '',
    website: '',
    logo_url: '',
  })

  const autoSlug = (name: string) => {
    setForm((f) => ({
      ...f,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Not authenticated')
      setSaving(false)
      return
    }

    // Create org
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: form.name,
        slug: form.slug,
        website: form.website || null,
        logo_url: form.logo_url || null,
      })
      .select()
      .single()

    if (orgError) {
      setError(orgError.message)
      setSaving(false)
      return
    }

    // Make user the owner
    const { error: memberError } = await supabase
      .from('org_members')
      .insert({
        org_id: org.id,
        user_id: user.id,
        role: 'owner',
      })

    if (memberError) {
      setError(memberError.message)
      setSaving(false)
      return
    }

    router.push(`/admin/${form.slug}`)
    router.refresh()
  }

  const inputClass =
    'w-full px-3.5 py-2.5 bg-ink border border-ink rounded-lg text-sm text-cream outline-none focus:ring-2 focus:ring-warm-gray transition-colors font-[inherit] placeholder:text-warm-gray'
  const labelClass = 'block text-[11px] text-warm-gray uppercase tracking-wider mb-1.5'

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4 relative">
      <div className="absolute inset-0 blueprint-grid pointer-events-none" />
      <div className="w-full max-w-lg relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-serif text-ink mb-2">Create Organization</h1>
          <p className="text-warm-gray text-sm">
            Organizations hold your tools, review funnels, and team members.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="border border-warm-border rounded-xl p-6 space-y-6 bg-cream">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Organization Name</label>
                <input
                  value={form.name}
                  onChange={(e) => autoSlug(e.target.value)}
                  placeholder="Sturdy Health"
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className={labelClass}>URL Slug</label>
                <input
                  value={form.slug}
                  onChange={(e) => setForm(f => ({ ...f, slug: e.target.value }))}
                  placeholder="sturdy-health"
                  className={inputClass}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Website (optional)</label>
                <input
                  value={form.website}
                  onChange={(e) => setForm(f => ({ ...f, website: e.target.value }))}
                  placeholder="https://sturdyhealth.org"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Logo URL (optional)</label>
                <input
                  value={form.logo_url}
                  onChange={(e) => setForm(f => ({ ...f, logo_url: e.target.value }))}
                  placeholder="https://..."
                  className={inputClass}
                />
              </div>
            </div>

            {error && <p className="text-red-600 text-xs">{error}</p>}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-ink hover:bg-ink/90 text-cream text-sm font-medium rounded-full transition-colors disabled:opacity-50"
              >
                {saving ? 'Creating...' : 'Create Organization'}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="px-6 py-2.5 border border-warm-border text-warm-gray text-sm rounded-full hover:text-ink hover:border-ink transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
