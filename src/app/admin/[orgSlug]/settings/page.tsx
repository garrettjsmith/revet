'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import type { Organization } from '@/lib/types'

export default function OrgSettingsPage() {
  const router = useRouter()
  const params = useParams()
  const orgSlug = params.orgSlug as string
  const supabase = createClient()

  const [org, setOrg] = useState<Organization | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: '',
    slug: '',
    website: '',
    logo_url: '',
  })

  useEffect(() => {
    async function load() {
      const { data: orgs } = await supabase
        .from('organizations')
        .select('*')
        .eq('slug', orgSlug)
        .single()

      if (orgs) {
        setOrg(orgs as Organization)
        setForm({
          name: orgs.name || '',
          slug: orgs.slug || '',
          website: orgs.website || '',
          logo_url: orgs.logo_url || '',
        })
      }
    }
    load()
  }, [orgSlug, supabase])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!org) return
    setSaving(true)
    setError('')

    const { error } = await supabase
      .from('organizations')
      .update({
        name: form.name,
        slug: form.slug,
        website: form.website || null,
        logo_url: form.logo_url || null,
      })
      .eq('id', org.id)

    if (error) {
      setError(error.message)
      setSaving(false)
    } else {
      if (form.slug !== orgSlug) {
        router.push(`/admin/${form.slug}/settings`)
      }
      router.refresh()
      setSaving(false)
    }
  }

  const inputClass =
    'w-full px-3.5 py-2.5 bg-ink border border-ink rounded-lg text-sm text-cream outline-none focus:ring-2 focus:ring-warm-gray transition-colors font-[inherit] placeholder:text-warm-gray'
  const labelClass = 'block text-[11px] text-warm-gray uppercase tracking-wider mb-1.5'

  if (!org) {
    return <div className="text-warm-gray text-sm">Loading...</div>
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-serif text-ink">Organization Settings</h1>

      <form onSubmit={handleSave}>
        <div className="border border-warm-border rounded-xl p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Organization Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>URL Slug</label>
              <input
                value={form.slug}
                onChange={(e) => setForm(f => ({ ...f, slug: e.target.value }))}
                className={inputClass}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Website</label>
              <input
                value={form.website}
                onChange={(e) => setForm(f => ({ ...f, website: e.target.value }))}
                placeholder="https://..."
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Logo URL</label>
              <input
                value={form.logo_url}
                onChange={(e) => setForm(f => ({ ...f, logo_url: e.target.value }))}
                placeholder="https://..."
                className={inputClass}
              />
            </div>
          </div>

          {error && <p className="text-red-600 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-ink hover:bg-ink/90 text-cream text-sm font-medium rounded-full transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
