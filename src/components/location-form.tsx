'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Location, LocationType } from '@/lib/types'

interface Props {
  location?: Location
  orgId: string
  orgSlug: string
}

const LOCATION_TYPES: { value: LocationType; label: string; description: string }[] = [
  { value: 'place', label: 'Place', description: 'Physical storefront or office' },
  { value: 'practitioner', label: 'Practitioner', description: 'Individual provider listing' },
  { value: 'service_area', label: 'Service Area', description: 'Business that serves an area' },
]

export function LocationForm({ location, orgId, orgSlug }: Props) {
  const isEditing = !!location
  const router = useRouter()
  const supabase = createClient()
  const basePath = `/admin/${orgSlug}/locations`

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: location?.name || '',
    slug: location?.slug || '',
    type: (location?.type || 'place') as LocationType,
    place_id: location?.place_id || '',
    phone: location?.phone || '',
    email: location?.email || '',
    timezone: location?.timezone || 'America/New_York',
    address_line1: location?.address_line1 || '',
    address_line2: location?.address_line2 || '',
    city: location?.city || '',
    state: location?.state || '',
    postal_code: location?.postal_code || '',
    country: location?.country || 'US',
    active: location?.active ?? true,
  })

  const set = (key: string, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }))

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
      org_id: orgId,
      place_id: form.place_id || null,
      phone: form.phone || null,
      email: form.email || null,
      address_line1: form.address_line1 || null,
      address_line2: form.address_line2 || null,
      city: form.city || null,
      state: form.state || null,
      postal_code: form.postal_code || null,
    }

    let result
    if (isEditing) {
      result = await supabase
        .from('locations')
        .update(payload)
        .eq('id', location!.id)
    } else {
      result = await supabase.from('locations').insert(payload)
    }

    if (result.error) {
      setError(result.error.message)
      setSaving(false)
    } else {
      router.push(basePath)
      router.refresh()
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this location and all its review funnels? This cannot be undone.')) return
    setSaving(true)
    await supabase.from('locations').delete().eq('id', location!.id)
    router.push(basePath)
    router.refresh()
  }

  const inputClass =
    'w-full px-3.5 py-2.5 bg-ink border border-ink rounded-lg text-sm text-cream outline-none focus:ring-2 focus:ring-warm-gray transition-colors font-[inherit] placeholder:text-warm-gray'
  const labelClass = 'block text-[11px] text-warm-gray uppercase tracking-wider mb-1.5'

  return (
    <form onSubmit={handleSubmit}>
      <div className="border border-warm-border rounded-xl p-6 space-y-6">
        {/* Type selector */}
        <div>
          <label className={labelClass}>Location Type</label>
          <div className="grid grid-cols-3 gap-3">
            {LOCATION_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => set('type', t.value)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  form.type === t.value
                    ? 'border-ink bg-ink text-cream'
                    : 'border-warm-border hover:border-ink/30'
                }`}
              >
                <div className={`text-sm font-medium ${form.type === t.value ? 'text-cream' : 'text-ink'}`}>
                  {t.label}
                </div>
                <div className={`text-xs mt-0.5 ${form.type === t.value ? 'text-warm-gray' : 'text-warm-gray'}`}>
                  {t.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Name + Slug */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Location Name</label>
            <input
              value={form.name}
              onChange={(e) => autoSlug(e.target.value)}
              placeholder="Downtown Office"
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className={labelClass}>URL Slug</label>
            <input
              value={form.slug}
              onChange={(e) => set('slug', e.target.value)}
              placeholder="downtown-office"
              className={inputClass}
              required
            />
          </div>
        </div>

        {/* Contact */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Contact Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="manager@example.com"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="(555) 123-4567"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Timezone</label>
            <select
              value={form.timezone}
              onChange={(e) => set('timezone', e.target.value)}
              className={inputClass}
            >
              <option value="America/New_York">Eastern</option>
              <option value="America/Chicago">Central</option>
              <option value="America/Denver">Mountain</option>
              <option value="America/Los_Angeles">Pacific</option>
              <option value="America/Anchorage">Alaska</option>
              <option value="Pacific/Honolulu">Hawaii</option>
            </select>
          </div>
        </div>

        {/* Google Business Profile */}
        <div>
          <label className={labelClass}>Google Place ID</label>
          <input
            value={form.place_id}
            onChange={(e) => set('place_id', e.target.value)}
            placeholder="ChIJ..."
            className={inputClass}
          />
          <p className="text-xs text-warm-gray mt-1">
            Used for Google review links and GBP integration.
            {form.type === 'service_area' && ' Optional for service area businesses.'}
          </p>
        </div>

        {/* Address */}
        {form.type !== 'service_area' && (
          <>
            <div>
              <label className={labelClass}>Address</label>
              <input
                value={form.address_line1}
                onChange={(e) => set('address_line1', e.target.value)}
                placeholder="123 Main St"
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className={labelClass}>City</label>
                <input
                  value={form.city}
                  onChange={(e) => set('city', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>State</label>
                <input
                  value={form.state}
                  onChange={(e) => set('state', e.target.value)}
                  placeholder="MA"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Postal Code</label>
                <input
                  value={form.postal_code}
                  onChange={(e) => set('postal_code', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Country</label>
                <input
                  value={form.country}
                  onChange={(e) => set('country', e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </>
        )}

        {/* Active toggle */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => set('active', e.target.checked)}
            className="rounded"
          />
          <span className="text-sm text-warm-gray">Active</span>
        </div>

        {/* Actions */}
        {error && <p className="text-red-600 text-xs">{error}</p>}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-ink hover:bg-ink/90 text-cream text-sm font-medium rounded-full transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : isEditing ? 'Update Location' : 'Create Location'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2.5 border border-warm-border text-warm-gray text-sm rounded-full hover:text-ink hover:border-ink transition-colors"
          >
            Cancel
          </button>
          {isEditing && (
            <button
              type="button"
              onClick={handleDelete}
              className="ml-auto px-4 py-2.5 text-red-600 text-xs hover:text-red-500 transition-colors"
            >
              Delete Location
            </button>
          )}
        </div>
      </div>
    </form>
  )
}
