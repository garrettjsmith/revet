'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { GBPProfile, GBPCategory, GBPHoursPeriod } from '@/lib/types'

const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
const DAY_SHORT: Record<string, string> = {
  MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed', THURSDAY: 'Thu',
  FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun',
}

interface EditorProps {
  profile: GBPProfile
  locationId: string
  onClose: () => void
}

interface CategoryOption {
  id: string
  displayName: string
}

export function GBPProfileEditor({ profile, locationId, onClose }: EditorProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Editable fields
  const [description, setDescription] = useState(profile.description || '')
  const [phone, setPhone] = useState(profile.phone_primary || '')
  const [website, setWebsite] = useState(profile.website_uri || '')
  const [primaryCategory, setPrimaryCategory] = useState<CategoryOption | null>(
    profile.primary_category_id
      ? { id: profile.primary_category_id, displayName: profile.primary_category_name || '' }
      : null
  )
  const [additionalCategories, setAdditionalCategories] = useState<CategoryOption[]>(
    (profile.additional_categories || []).map((c) => ({
      id: c.name.replace('categories/', ''),
      displayName: c.displayName,
    }))
  )
  const [hours, setHours] = useState<GBPHoursPeriod[]>(
    profile.regular_hours?.periods || []
  )

  // Category search
  const [catQuery, setCatQuery] = useState('')
  const [catResults, setCatResults] = useState<CategoryOption[]>([])
  const [catSearching, setCatSearching] = useState(false)
  const [catTarget, setCatTarget] = useState<'primary' | 'additional' | null>(null)

  const searchCategories = useCallback(async (query: string) => {
    if (query.length < 2) { setCatResults([]); return }
    setCatSearching(true)
    try {
      const res = await fetch(`/api/categories/search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setCatResults(data.categories || [])
    } catch {
      setCatResults([])
    }
    setCatSearching(false)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => searchCategories(catQuery), 300)
    return () => clearTimeout(timer)
  }, [catQuery, searchCategories])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {}

      if (description !== (profile.description || '')) {
        payload.description = description
      }
      if (phone !== (profile.phone_primary || '')) {
        payload.phone_primary = phone
      }
      if (website !== (profile.website_uri || '')) {
        payload.website_uri = website
      }

      // Categories
      const currentPrimaryId = profile.primary_category_id
      const currentAdditionalIds = (profile.additional_categories || []).map((c) => c.name.replace('categories/', ''))
      const newPrimaryId = primaryCategory?.id
      const newAdditionalIds = additionalCategories.map((c) => c.id)

      if (
        newPrimaryId !== currentPrimaryId ||
        JSON.stringify(newAdditionalIds) !== JSON.stringify(currentAdditionalIds)
      ) {
        payload.categories = {
          primary: primaryCategory ? { id: primaryCategory.id, displayName: primaryCategory.displayName } : undefined,
          additional: additionalCategories.map((c) => ({ id: c.id, displayName: c.displayName })),
        }
      }

      // Hours
      const currentHoursJson = JSON.stringify(profile.regular_hours?.periods || [])
      const newHoursJson = JSON.stringify(hours)
      if (newHoursJson !== currentHoursJson) {
        payload.regular_hours = { periods: hours }
      }

      if (Object.keys(payload).length === 0) {
        onClose()
        return
      }

      const res = await fetch(`/api/locations/${locationId}/gbp-profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to save')
        setSaving(false)
        return
      }

      router.refresh()
      onClose()
    } catch (err) {
      setError('Failed to save changes')
    }
    setSaving(false)
  }

  const toggleDay = (day: string) => {
    const existing = hours.find((h) => h.openDay === day)
    if (existing) {
      setHours(hours.filter((h) => h.openDay !== day))
    } else {
      setHours([...hours, { openDay: day, openTime: '09:00', closeDay: day, closeTime: '17:00' }])
    }
  }

  const updateHour = (day: string, field: 'openTime' | 'closeTime', value: string) => {
    setHours(hours.map((h) =>
      h.openDay === day ? { ...h, [field]: value } : h
    ))
  }

  return (
    <div className="border border-ink rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-warm-border bg-ink">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-cream">Edit Profile</h2>
          <button
            onClick={onClose}
            className="text-xs text-warm-gray hover:text-cream transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {/* Description */}
        <div>
          <label className="text-sm font-medium text-ink block mb-2">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 750))}
            rows={4}
            className="w-full px-3 py-2 border border-warm-border rounded-lg text-sm text-ink outline-none focus:ring-2 focus:ring-ink/20 resize-y placeholder:text-warm-gray"
            placeholder="Business description (up to 750 characters)"
          />
          <div className="text-[10px] text-warm-gray mt-1 text-right">
            {description.length}/750
          </div>
        </div>

        {/* Phone */}
        <div>
          <label className="text-sm font-medium text-ink block mb-2">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2 border border-warm-border rounded-lg text-sm text-ink outline-none focus:ring-2 focus:ring-ink/20 placeholder:text-warm-gray"
            placeholder="+1 (555) 123-4567"
          />
        </div>

        {/* Website */}
        <div>
          <label className="text-sm font-medium text-ink block mb-2">Website</label>
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="w-full px-3 py-2 border border-warm-border rounded-lg text-sm text-ink outline-none focus:ring-2 focus:ring-ink/20 placeholder:text-warm-gray"
            placeholder="https://example.com"
          />
        </div>

        {/* Primary Category */}
        <div>
          <label className="text-sm font-medium text-ink block mb-2">Primary Category</label>
          {primaryCategory ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink px-3 py-1.5 bg-warm-light rounded-full border border-warm-border">
                {primaryCategory.displayName}
              </span>
              <button
                onClick={() => { setCatTarget('primary'); setCatQuery('') }}
                className="text-[10px] text-warm-gray hover:text-ink transition-colors"
              >
                Change
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setCatTarget('primary'); setCatQuery('') }}
              className="text-xs text-warm-gray hover:text-ink transition-colors"
            >
              Set primary category
            </button>
          )}
        </div>

        {/* Additional Categories */}
        <div>
          <label className="text-sm font-medium text-ink block mb-2">
            Additional Categories ({additionalCategories.length}/9)
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {additionalCategories.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1 text-xs text-ink px-2.5 py-1 bg-warm-light rounded-full border border-warm-border">
                {c.displayName}
                <button
                  onClick={() => setAdditionalCategories(additionalCategories.filter((ac) => ac.id !== c.id))}
                  className="text-warm-gray hover:text-ink transition-colors"
                >
                  x
                </button>
              </span>
            ))}
          </div>
          {additionalCategories.length < 9 && (
            <button
              onClick={() => { setCatTarget('additional'); setCatQuery('') }}
              className="text-[10px] text-warm-gray hover:text-ink transition-colors"
            >
              + Add category
            </button>
          )}
        </div>

        {/* Category Search Dropdown */}
        {catTarget && (
          <div className="border border-warm-border rounded-lg p-3 bg-warm-light">
            <input
              type="text"
              value={catQuery}
              onChange={(e) => setCatQuery(e.target.value)}
              placeholder="Search categories..."
              autoFocus
              className="w-full px-3 py-2 border border-warm-border rounded-lg text-sm text-ink outline-none focus:ring-2 focus:ring-ink/20 placeholder:text-warm-gray mb-2"
            />
            {catSearching && <p className="text-xs text-warm-gray">Searching...</p>}
            {catResults.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-0.5">
                {catResults.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      if (catTarget === 'primary') {
                        setPrimaryCategory(c)
                      } else {
                        if (!additionalCategories.find((ac) => ac.id === c.id)) {
                          setAdditionalCategories([...additionalCategories, c])
                        }
                      }
                      setCatTarget(null)
                      setCatQuery('')
                      setCatResults([])
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-ink hover:bg-warm-border/30 rounded transition-colors"
                  >
                    {c.displayName}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => { setCatTarget(null); setCatQuery(''); setCatResults([]) }}
              className="text-[10px] text-warm-gray hover:text-ink mt-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Regular Hours */}
        <div>
          <label className="text-sm font-medium text-ink block mb-2">Regular Hours</label>
          <div className="space-y-2">
            {DAY_ORDER.map((day) => {
              const period = hours.find((h) => h.openDay === day)
              return (
                <div key={day} className="flex items-center gap-3">
                  <button
                    onClick={() => toggleDay(day)}
                    className={`w-12 text-xs font-medium text-left ${period ? 'text-ink' : 'text-warm-gray'}`}
                  >
                    {DAY_SHORT[day]}
                  </button>
                  {period ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={period.openTime}
                        onChange={(e) => updateHour(day, 'openTime', e.target.value)}
                        className="px-2 py-1 border border-warm-border rounded text-xs text-ink outline-none focus:ring-2 focus:ring-ink/20"
                      />
                      <span className="text-xs text-warm-gray">to</span>
                      <input
                        type="time"
                        value={period.closeTime}
                        onChange={(e) => updateHour(day, 'closeTime', e.target.value)}
                        className="px-2 py-1 border border-warm-border rounded text-xs text-ink outline-none focus:ring-2 focus:ring-ink/20"
                      />
                      <button
                        onClick={() => toggleDay(day)}
                        className="text-[10px] text-warm-gray hover:text-red-500 transition-colors"
                      >
                        Closed
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => toggleDay(day)}
                      className="text-xs text-warm-gray hover:text-ink transition-colors"
                    >
                      Set hours
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-ink hover:bg-ink/90 text-cream text-sm font-medium rounded-full transition-colors disabled:opacity-50"
          >
            {saving ? 'Pushing to Google...' : 'Save & Push to Google'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-warm-gray text-sm hover:text-ink transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
