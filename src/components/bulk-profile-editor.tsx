'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
const DAY_SHORT: Record<string, string> = {
  MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed', THURSDAY: 'Thu',
  FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun',
}

interface CategoryOption {
  id: string
  displayName: string
}

interface HoursPeriod {
  openDay: string
  openTime: string
  closeDay: string
  closeTime: string
}

interface Props {
  locationIds: string[]
  onClose: () => void
}

export function BulkProfileEditor({ locationIds, onClose }: Props) {
  const router = useRouter()
  const [applying, setApplying] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [results, setResults] = useState<Array<{ name: string; status: string; error?: string }> | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Field toggles
  const [editDescription, setEditDescription] = useState(false)
  const [editPhone, setEditPhone] = useState(false)
  const [editWebsite, setEditWebsite] = useState(false)
  const [editCategories, setEditCategories] = useState(false)
  const [editHours, setEditHours] = useState(false)

  // Field values
  const [description, setDescription] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [primaryCategory, setPrimaryCategory] = useState<CategoryOption | null>(null)
  const [additionalCategories, setAdditionalCategories] = useState<CategoryOption[]>([])
  const [catSearch, setCatSearch] = useState('')
  const [catResults, setCatResults] = useState<CategoryOption[]>([])
  const [searchingCats, setSearchingCats] = useState(false)
  const [hours, setHours] = useState<Record<string, { enabled: boolean; open: string; close: string }>>(() => {
    const init: Record<string, { enabled: boolean; open: string; close: string }> = {}
    DAYS.forEach((day) => { init[day] = { enabled: false, open: '09:00', close: '17:00' } })
    return init
  })

  // Category search
  const searchCategories = useCallback(async (query: string) => {
    if (query.length < 2) { setCatResults([]); return }
    setSearchingCats(true)
    try {
      const res = await fetch(`/api/categories/search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setCatResults(data.categories || [])
    } catch { setCatResults([]) }
    setSearchingCats(false)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => searchCategories(catSearch), 300)
    return () => clearTimeout(timer)
  }, [catSearch, searchCategories])

  const hasFields = editDescription || editPhone || editWebsite || editCategories || editHours

  const handleApply = async () => {
    if (!hasFields) return
    setApplying(true)
    setError(null)
    setResults(null)
    setProgress({ current: 0, total: locationIds.length })

    const fields: Record<string, any> = {}
    if (editDescription) fields.description = description
    if (editPhone) fields.phone_primary = phone
    if (editWebsite) fields.website_uri = website
    if (editCategories) {
      fields.categories = {}
      if (primaryCategory) fields.categories.primary = primaryCategory
      if (additionalCategories.length > 0) fields.categories.additional = additionalCategories
    }
    if (editHours) {
      const periods: HoursPeriod[] = []
      DAYS.forEach((day) => {
        if (hours[day].enabled) {
          periods.push({
            openDay: day,
            openTime: hours[day].open,
            closeDay: day,
            closeTime: hours[day].close,
          })
        }
      })
      fields.regular_hours = { periods }
    }

    try {
      const res = await fetch('/api/locations/bulk-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_ids: locationIds, fields }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Bulk edit failed')
      setResults(data.results || [])
      setProgress({ current: data.summary?.total || 0, total: locationIds.length })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk edit failed')
    }
    setApplying(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-warm-border px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-sm font-semibold text-ink">Edit Profiles</h2>
            <p className="text-[10px] text-warm-gray mt-0.5">{locationIds.length} locations selected</p>
          </div>
          <button onClick={onClose} className="text-xs text-warm-gray hover:text-ink">Close</button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>
          )}

          {results ? (
            <div className="space-y-3">
              <div className="text-sm font-medium text-ink">Results</div>
              <div className="space-y-1">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs py-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      r.status === 'updated' ? 'bg-emerald-500' :
                      r.status === 'skipped' ? 'bg-amber-500' : 'bg-red-500'
                    }`} />
                    <span className="text-ink flex-1">{r.name}</span>
                    <span className="text-warm-gray">{r.status}</span>
                    {r.error && <span className="text-red-500 text-[10px]">{r.error}</span>}
                  </div>
                ))}
              </div>
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-cream bg-ink rounded-full"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Field toggles */}
              <div className="space-y-3">
                <div className="text-[10px] text-warm-gray uppercase tracking-wider font-medium">Select fields to update</div>

                {/* Description */}
                <div>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={editDescription} onChange={(e) => setEditDescription(e.target.checked)} className="rounded" />
                    <span className="text-xs text-ink font-medium">Description</span>
                  </label>
                  {editDescription && (
                    <div className="mt-2 ml-6">
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        maxLength={750}
                        rows={3}
                        placeholder="Business description..."
                        className="w-full px-3 py-2 text-sm border border-warm-border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-ink/20 resize-none"
                      />
                      <div className="text-[10px] text-warm-gray text-right">{description.length}/750</div>
                    </div>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={editPhone} onChange={(e) => setEditPhone(e.target.checked)} className="rounded" />
                    <span className="text-xs text-ink font-medium">Phone</span>
                  </label>
                  {editPhone && (
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 (555) 123-4567"
                      className="mt-2 ml-6 w-64 px-3 py-2 text-sm border border-warm-border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-ink/20"
                    />
                  )}
                </div>

                {/* Website */}
                <div>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={editWebsite} onChange={(e) => setEditWebsite(e.target.checked)} className="rounded" />
                    <span className="text-xs text-ink font-medium">Website</span>
                  </label>
                  {editWebsite && (
                    <input
                      type="url"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://..."
                      className="mt-2 ml-6 w-full px-3 py-2 text-sm border border-warm-border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-ink/20"
                    />
                  )}
                </div>

                {/* Categories */}
                <div>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={editCategories} onChange={(e) => setEditCategories(e.target.checked)} className="rounded" />
                    <span className="text-xs text-ink font-medium">Categories</span>
                  </label>
                  {editCategories && (
                    <div className="mt-2 ml-6 space-y-2">
                      <div>
                        <label className="text-[10px] text-warm-gray block mb-1">Search categories</label>
                        <input
                          type="text"
                          value={catSearch}
                          onChange={(e) => setCatSearch(e.target.value)}
                          placeholder="e.g. Dentist, Restaurant..."
                          className="w-full px-3 py-2 text-sm border border-warm-border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-ink/20"
                        />
                        {searchingCats && <div className="text-[10px] text-warm-gray mt-1">Searching...</div>}
                        {catResults.length > 0 && (
                          <div className="mt-1 border border-warm-border rounded-lg max-h-32 overflow-y-auto">
                            {catResults.map((cat) => (
                              <button
                                key={cat.id}
                                onClick={() => {
                                  if (!primaryCategory) {
                                    setPrimaryCategory(cat)
                                  } else if (additionalCategories.length < 9 && !additionalCategories.find((c) => c.id === cat.id) && cat.id !== primaryCategory.id) {
                                    setAdditionalCategories([...additionalCategories, cat])
                                  }
                                  setCatSearch('')
                                  setCatResults([])
                                }}
                                className="w-full text-left px-3 py-1.5 text-xs hover:bg-warm-light transition-colors"
                              >
                                {cat.displayName}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {primaryCategory && (
                        <div className="flex flex-wrap gap-1.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-ink text-cream rounded-full">
                            {primaryCategory.displayName}
                            <button onClick={() => setPrimaryCategory(null)} className="hover:text-cream/60">x</button>
                          </span>
                          {additionalCategories.map((cat) => (
                            <span key={cat.id} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-warm-light text-ink rounded-full">
                              {cat.displayName}
                              <button onClick={() => setAdditionalCategories(additionalCategories.filter((c) => c.id !== cat.id))} className="hover:text-ink/60">x</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Hours */}
                <div>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={editHours} onChange={(e) => setEditHours(e.target.checked)} className="rounded" />
                    <span className="text-xs text-ink font-medium">Regular Hours</span>
                  </label>
                  {editHours && (
                    <div className="mt-2 ml-6 space-y-1">
                      {DAYS.map((day) => (
                        <div key={day} className="flex items-center gap-2">
                          <label className="flex items-center gap-1.5 w-16">
                            <input
                              type="checkbox"
                              checked={hours[day].enabled}
                              onChange={(e) => setHours({ ...hours, [day]: { ...hours[day], enabled: e.target.checked } })}
                              className="rounded"
                            />
                            <span className="text-[10px] text-ink">{DAY_SHORT[day]}</span>
                          </label>
                          {hours[day].enabled ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="time"
                                value={hours[day].open}
                                onChange={(e) => setHours({ ...hours, [day]: { ...hours[day], open: e.target.value } })}
                                className="px-2 py-1 text-xs border border-warm-border rounded bg-white"
                              />
                              <span className="text-[10px] text-warm-gray">to</span>
                              <input
                                type="time"
                                value={hours[day].close}
                                onChange={(e) => setHours({ ...hours, [day]: { ...hours[day], close: e.target.value } })}
                                className="px-2 py-1 text-xs border border-warm-border rounded bg-white"
                              />
                            </div>
                          ) : (
                            <span className="text-[10px] text-warm-gray">Closed</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Apply button */}
              <div className="pt-4 border-t border-warm-border">
                {applying ? (
                  <div className="space-y-2">
                    <div className="h-1.5 bg-warm-border/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-ink rounded-full transition-all"
                        style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-warm-gray">
                      Updating profiles...
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleApply}
                    disabled={!hasFields}
                    className="px-4 py-2 text-xs font-medium text-cream bg-ink rounded-full hover:bg-ink/90 transition-colors disabled:opacity-50"
                  >
                    Apply to {locationIds.length} locations
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
