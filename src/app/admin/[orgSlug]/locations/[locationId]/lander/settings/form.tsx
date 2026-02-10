'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { LocalLander } from '@/lib/types'

interface GBPDefaults {
  businessName: string | null
  description: string | null
  categoryName: string | null
}

interface Props {
  orgId: string
  orgSlug: string
  locationId: string
  locationName: string
  lander: LocalLander | null
  gbpDefaults: GBPDefaults | null
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80)
}

export function LanderSettingsForm({ orgId, orgSlug, locationId, locationName, lander, gbpDefaults }: Props) {
  const router = useRouter()
  const isEdit = !!lander

  const [slug, setSlug] = useState(lander?.slug || generateSlug(locationName))
  const [heading, setHeading] = useState(lander?.heading || gbpDefaults?.businessName || locationName)
  const [description, setDescription] = useState(lander?.description || gbpDefaults?.description || '')
  const [primaryColor, setPrimaryColor] = useState(lander?.primary_color || '#1B4965')
  const [logoUrl, setLogoUrl] = useState(lander?.logo_url || '')
  const [customAbout, setCustomAbout] = useState(lander?.custom_about || '')
  const [showReviews, setShowReviews] = useState(lander?.show_reviews ?? true)
  const [showMap, setShowMap] = useState(lander?.show_map ?? true)
  const [showFaq, setShowFaq] = useState(lander?.show_faq ?? true)
  const [active, setActive] = useState(lander?.active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      const res = await fetch('/api/landers', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: lander?.id,
          org_id: orgId,
          location_id: locationId,
          slug,
          heading: heading || null,
          description: description || null,
          primary_color: primaryColor,
          logo_url: logoUrl || null,
          custom_about: customAbout || null,
          show_reviews: showReviews,
          show_map: showMap,
          show_faq: showFaq,
          active,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to save lander')
      }

      router.push(`/admin/${orgSlug}/locations/${locationId}/lander`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const basePath = `/admin/${orgSlug}/locations/${locationId}`

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Slug */}
      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">URL Slug</label>
        <div className="flex items-center gap-0 border border-warm-border rounded-lg overflow-hidden">
          <span className="text-xs text-warm-gray bg-warm-light px-3 py-2.5 border-r border-warm-border shrink-0">
            /l/
          </span>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            className="flex-1 px-3 py-2.5 text-sm text-ink bg-transparent outline-none"
            required
          />
        </div>
      </div>

      {/* Heading */}
      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">Page Heading</label>
        <input
          type="text"
          value={heading}
          onChange={(e) => setHeading(e.target.value)}
          placeholder={locationName}
          className="w-full px-3 py-2.5 text-sm text-ink border border-warm-border rounded-lg outline-none focus:border-ink transition-colors"
        />
        <p className="text-xs text-warm-gray mt-1">Defaults to location name if blank</p>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">Meta Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={gbpDefaults?.description || 'Auto-generated from GBP profile'}
          rows={3}
          className="w-full px-3 py-2.5 text-sm text-ink border border-warm-border rounded-lg outline-none focus:border-ink transition-colors resize-y"
        />
      </div>

      {/* About (custom override) */}
      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">About Section</label>
        <textarea
          value={customAbout}
          onChange={(e) => setCustomAbout(e.target.value)}
          placeholder="Leave blank to use GBP description"
          rows={4}
          className="w-full px-3 py-2.5 text-sm text-ink border border-warm-border rounded-lg outline-none focus:border-ink transition-colors resize-y"
        />
      </div>

      {/* Primary Color */}
      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">Brand Color</label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            className="w-10 h-10 rounded-lg border border-warm-border cursor-pointer"
          />
          <input
            type="text"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            className="w-28 px-3 py-2.5 text-sm text-ink font-mono border border-warm-border rounded-lg outline-none focus:border-ink transition-colors"
          />
        </div>
      </div>

      {/* Logo URL */}
      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">Logo URL</label>
        <input
          type="url"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://example.com/logo.png"
          className="w-full px-3 py-2.5 text-sm text-ink border border-warm-border rounded-lg outline-none focus:border-ink transition-colors"
        />
      </div>

      {/* Display toggles */}
      <div>
        <label className="block text-sm font-medium text-ink mb-3">Sections</label>
        <div className="space-y-2.5">
          <Toggle label="Show reviews section" checked={showReviews} onChange={setShowReviews} />
          <Toggle label="Show map section" checked={showMap} onChange={setShowMap} />
          <Toggle label="Show FAQ section" checked={showFaq} onChange={setShowFaq} />
        </div>
      </div>

      {/* Active toggle */}
      <div className="border-t border-warm-border pt-6">
        <Toggle label="Page is active (publicly visible)" checked={active} onChange={setActive} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving || !slug}
          className="px-6 py-2.5 bg-ink hover:bg-ink/90 text-cream text-sm font-medium rounded-full transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Lander'}
        </button>
        <a
          href={`${basePath}/lander`}
          className="px-6 py-2.5 border border-warm-border text-warm-gray hover:text-ink text-sm rounded-full no-underline transition-colors"
        >
          Cancel
        </a>
      </div>
    </form>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? 'bg-ink' : 'bg-warm-border'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
      <span className="text-sm text-ink">{label}</span>
    </label>
  )
}
