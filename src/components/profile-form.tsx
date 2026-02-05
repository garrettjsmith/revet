'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { ReviewProfile, Organization } from '@/lib/types'

interface Props {
  profile?: ReviewProfile
  organizations: Organization[]
}

export function ProfileForm({ profile, organizations }: Props) {
  const isEditing = !!profile
  const router = useRouter()
  const supabase = createClient()

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    org_id: profile?.org_id || organizations[0]?.id || '',
    name: profile?.name || '',
    slug: profile?.slug || '',
    heading: profile?.heading || 'Thank you for your visit',
    subtext: profile?.subtext || 'Your feedback helps us provide the best care possible.',
    place_id: profile?.place_id || '',
    manager_email: profile?.manager_email || '',
    manager_name: profile?.manager_name || 'Practice Manager',
    primary_color: profile?.primary_color || '#1B4965',
    accent_color: profile?.accent_color || '#5FA8D3',
    logo_url: profile?.logo_url || '',
    logo_text: profile?.logo_text || '',
    logo_subtext: profile?.logo_subtext || '',
    positive_threshold: profile?.positive_threshold || 4,
    active: profile?.active ?? true,
  })

  const set = (key: string, value: string | number | boolean) =>
    setForm((f) => ({ ...f, [key]: value }))

  // Auto-generate slug from name
  const autoSlug = (name: string) => {
    set('name', name)
    if (!isEditing) {
      set('slug', name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    const payload = {
      ...form,
      logo_url: form.logo_url || null,
      logo_text: form.logo_text || null,
      logo_subtext: form.logo_subtext || null,
    }

    let result
    if (isEditing) {
      result = await supabase
        .from('review_profiles')
        .update(payload)
        .eq('id', profile!.id)
    } else {
      result = await supabase.from('review_profiles').insert(payload)
    }

    if (result.error) {
      setError(result.error.message)
      setSaving(false)
    } else {
      router.push('/admin/profiles')
      router.refresh()
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this profile? This cannot be undone.')) return
    setSaving(true)
    await supabase.from('review_profiles').delete().eq('id', profile!.id)
    router.push('/admin/profiles')
    router.refresh()
  }

  const reviewUrl = form.place_id
    ? `https://search.google.com/local/writereview?placeid=${form.place_id}`
    : null

  const inputClass =
    'w-full px-3.5 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white outline-none focus:border-sky-500 transition-colors font-[inherit]'
  const labelClass = 'block text-[11px] text-gray-500 uppercase tracking-wider mb-1.5'

  return (
    <form onSubmit={handleSubmit}>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-6">
        {/* Org + Name + Slug */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Organization</label>
            <select
              value={form.org_id}
              onChange={(e) => set('org_id', e.target.value)}
              className={inputClass}
              required
            >
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Profile Name</label>
            <input
              value={form.name}
              onChange={(e) => autoSlug(e.target.value)}
              placeholder="Sturdy Health – Cardiology"
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className={labelClass}>URL Slug</label>
            <div className="flex items-center gap-0">
              <span className="text-xs text-gray-600 font-mono mr-1">/r/</span>
              <input
                value={form.slug}
                onChange={(e) => set('slug', e.target.value)}
                placeholder="sturdy-cardiology"
                className={inputClass}
                required
              />
            </div>
          </div>
        </div>

        {/* Google + Manager */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Google Place ID</label>
            <input
              value={form.place_id}
              onChange={(e) => set('place_id', e.target.value)}
              placeholder="ChIJ..."
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className={labelClass}>Manager Email</label>
            <input
              type="email"
              value={form.manager_email}
              onChange={(e) => set('manager_email', e.target.value)}
              placeholder="manager@sturdyhealth.org"
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className={labelClass}>Manager Name / Title</label>
            <input
              value={form.manager_name}
              onChange={(e) => set('manager_name', e.target.value)}
              placeholder="Practice Manager"
              className={inputClass}
            />
          </div>
        </div>

        {/* Heading + Subtext */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Page Heading</label>
            <input
              value={form.heading}
              onChange={(e) => set('heading', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Subtext</label>
            <input
              value={form.subtext}
              onChange={(e) => set('subtext', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {/* Logo + Colors */}
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className={labelClass}>Logo Text (Line 1)</label>
            <input
              value={form.logo_text}
              onChange={(e) => set('logo_text', e.target.value)}
              placeholder="STURDY"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Logo Text (Line 2)</label>
            <input
              value={form.logo_subtext}
              onChange={(e) => set('logo_subtext', e.target.value)}
              placeholder="HEALTH"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Primary Color</label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={form.primary_color}
                onChange={(e) => set('primary_color', e.target.value)}
                className="w-9 h-9 rounded border-0 cursor-pointer"
              />
              <input
                value={form.primary_color}
                onChange={(e) => set('primary_color', e.target.value)}
                className={`${inputClass} font-mono text-xs`}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Accent Color</label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={form.accent_color}
                onChange={(e) => set('accent_color', e.target.value)}
                className="w-9 h-9 rounded border-0 cursor-pointer"
              />
              <input
                value={form.accent_color}
                onChange={(e) => set('accent_color', e.target.value)}
                className={`${inputClass} font-mono text-xs`}
              />
            </div>
          </div>
        </div>

        {/* Logo URL (optional, overrides text logo) */}
        <div>
          <label className={labelClass}>Logo Image URL (optional — overrides text logo)</label>
          <input
            value={form.logo_url}
            onChange={(e) => set('logo_url', e.target.value)}
            placeholder="https://..."
            className={inputClass}
          />
        </div>

        {/* Threshold */}
        <div className="flex items-center gap-4">
          <div>
            <label className={labelClass}>Positive Threshold (rating ≥ this → Google)</label>
            <select
              value={form.positive_threshold}
              onChange={(e) => set('positive_threshold', Number(e.target.value))}
              className={`${inputClass} w-20`}
            >
              {[3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}★+</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 mt-5">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => set('active', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-400">Active</span>
          </div>
        </div>

        {/* Generated review URL preview */}
        {reviewUrl && (
          <div className="p-4 bg-gray-950 rounded-lg border border-gray-800">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">
              Generated Google Review URL
            </div>
            <code className="text-xs text-sky-400 font-mono break-all">{reviewUrl}</code>
          </div>
        )}

        {/* Notable integration info */}
        <div className="p-4 bg-gray-950 rounded-lg border border-gray-800">
          <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">
            Notable Integration URL
          </div>
          <code className="text-xs text-sky-400 font-mono">
            {process.env.NEXT_PUBLIC_APP_URL || 'https://lseo.app'}/r/{form.slug || '{slug}'}
          </code>
          <p className="text-xs text-gray-600 mt-2">
            Configure Notable to send this URL in the post-appointment message.
          </p>
        </div>

        {/* Actions */}
        {error && <p className="text-red-400 text-xs">{error}</p>}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : isEditing ? 'Update Profile' : 'Create Profile'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2.5 border border-gray-800 text-gray-400 text-sm rounded-lg hover:text-white transition-colors"
          >
            Cancel
          </button>
          {isEditing && (
            <button
              type="button"
              onClick={handleDelete}
              className="ml-auto px-4 py-2.5 text-red-500 text-xs hover:text-red-400 transition-colors"
            >
              Delete Profile
            </button>
          )}
        </div>
      </div>
    </form>
  )
}
