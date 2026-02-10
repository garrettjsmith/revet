'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'

interface LocationData {
  id: string
  name: string
  city: string | null
  state: string | null
  orgId: string
  orgName: string
  hasLander: boolean
  gbpCategoryId: string | null
  templateId: string
}

interface BulkLanderWizardProps {
  locations: LocationData[]
  orgId: string
  orgName: string
}

type Step = 'configure' | 'saving' | 'done'

interface ResultSummary {
  created: number
  skipped: number
  errors: number
  total: number
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

function previewSlug(name: string, city: string | null): string {
  const base = city ? `${name}-${city}` : name
  return slugify(base)
}

const BATCH_SIZE = 50

export function BulkLanderWizard({ locations, orgId, orgName }: BulkLanderWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('configure')

  // Defaults
  const [primaryColor, setPrimaryColor] = useState('#1B4965')
  const [logoUrl, setLogoUrl] = useState('')
  const [showReviews, setShowReviews] = useState(true)
  const [showMap, setShowMap] = useState(true)
  const [showFaq, setShowFaq] = useState(true)

  // Progress
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [result, setResult] = useState<ResultSummary | null>(null)

  const alreadyHaveLander = useMemo(
    () => locations.filter((l) => l.hasLander).length,
    [locations]
  )

  const willCreate = useMemo(
    () => locations.filter((l) => !l.hasLander).length,
    [locations]
  )

  const toCreate = useMemo(
    () => locations.filter((l) => !l.hasLander),
    [locations]
  )

  async function handleCreate() {
    setStep('saving')
    const ids = toCreate.map((l) => l.id)
    setProgress({ current: 0, total: ids.length })

    let totalCreated = 0
    let totalSkipped = 0
    let totalErrors = 0

    // Batch the requests
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batchIds = ids.slice(i, i + BATCH_SIZE)

      try {
        const res = await fetch('/api/landers/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            org_id: orgId,
            location_ids: batchIds,
            defaults: {
              primary_color: primaryColor,
              logo_url: logoUrl || undefined,
              show_reviews: showReviews,
              show_map: showMap,
              show_faq: showFaq,
            },
          }),
        })

        if (res.ok) {
          const data = await res.json()
          totalCreated += data.summary.created
          totalSkipped += data.summary.skipped
          totalErrors += data.summary.errors
        } else {
          totalErrors += batchIds.length
        }
      } catch {
        totalErrors += batchIds.length
      }

      setProgress({ current: Math.min(i + BATCH_SIZE, ids.length), total: ids.length })
    }

    setResult({
      created: totalCreated,
      skipped: totalSkipped + alreadyHaveLander,
      errors: totalErrors,
      total: locations.length,
    })
    setStep('done')
  }

  // --- Configure step ---
  if (step === 'configure') {
    return (
      <div>
        {/* Stats pills */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-ink rounded-xl p-5">
            <div className="text-[11px] text-cream/70 uppercase tracking-wider mb-1">Selected</div>
            <div className="text-2xl font-serif text-cream">{locations.length}</div>
          </div>
          <div className="bg-ink rounded-xl p-5">
            <div className="text-[11px] text-cream/70 uppercase tracking-wider mb-1">Already Have Lander</div>
            <div className="text-2xl font-serif text-cream">{alreadyHaveLander}</div>
          </div>
          <div className="bg-ink rounded-xl p-5">
            <div className="text-[11px] text-cream/70 uppercase tracking-wider mb-1">Will Create</div>
            <div className="text-2xl font-serif text-cream">{willCreate}</div>
          </div>
        </div>

        {/* Defaults card */}
        <div className="border border-warm-border rounded-xl p-6 mb-6">
          <h2 className="text-sm font-medium text-ink mb-4">Defaults</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-warm-gray mb-1">Primary Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-8 h-8 rounded border border-warm-border cursor-pointer"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1 px-3 py-1.5 border border-warm-border rounded-lg text-sm text-ink"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-warm-gray mb-1">Logo URL</label>
              <input
                type="text"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-1.5 border border-warm-border rounded-lg text-sm text-ink placeholder:text-warm-gray"
              />
            </div>
          </div>
          <div className="flex items-center gap-6 mt-4">
            <label className="flex items-center gap-2 text-xs text-ink">
              <input
                type="checkbox"
                checked={showReviews}
                onChange={(e) => setShowReviews(e.target.checked)}
                className="w-4 h-4 rounded border-warm-border"
              />
              Show Reviews
            </label>
            <label className="flex items-center gap-2 text-xs text-ink">
              <input
                type="checkbox"
                checked={showMap}
                onChange={(e) => setShowMap(e.target.checked)}
                className="w-4 h-4 rounded border-warm-border"
              />
              Show Map
            </label>
            <label className="flex items-center gap-2 text-xs text-ink">
              <input
                type="checkbox"
                checked={showFaq}
                onChange={(e) => setShowFaq(e.target.checked)}
                className="w-4 h-4 rounded border-warm-border"
              />
              Show FAQ
            </label>
          </div>
        </div>

        {/* Preview table */}
        <div className="border border-warm-border rounded-xl overflow-hidden mb-6">
          <div className="max-h-[50vh] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-warm-light border-b border-warm-border z-10">
                <tr>
                  <th className="text-left px-4 py-2.5 text-[11px] text-warm-gray uppercase tracking-wider font-medium">Location</th>
                  <th className="text-left px-4 py-2.5 text-[11px] text-warm-gray uppercase tracking-wider font-medium">City</th>
                  <th className="text-left px-4 py-2.5 text-[11px] text-warm-gray uppercase tracking-wider font-medium">Slug Preview</th>
                  <th className="text-left px-4 py-2.5 text-[11px] text-warm-gray uppercase tracking-wider font-medium">Template</th>
                  <th className="text-left px-4 py-2.5 text-[11px] text-warm-gray uppercase tracking-wider font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((loc) => (
                  <tr key={loc.id} className="border-b border-warm-border/50 last:border-0">
                    <td className="px-4 py-2.5 text-xs text-ink font-medium">{loc.name}</td>
                    <td className="px-4 py-2.5 text-xs text-warm-gray">{loc.city || '—'}</td>
                    <td className="px-4 py-2.5">
                      {loc.hasLander ? (
                        <span className="text-xs text-warm-gray">—</span>
                      ) : (
                        <span className="text-xs font-mono text-ink">/l/{previewSlug(loc.name, loc.city)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-warm-gray capitalize">
                      {loc.templateId.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-2.5">
                      {loc.hasLander ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-warm-light text-warm-gray">
                          Has Lander
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700">
                          Will Create
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push('/agency/locations')}
            className="px-5 py-2 border border-warm-border text-warm-gray text-xs rounded-full hover:text-ink hover:border-ink transition-colors"
          >
            Back
          </button>

          {willCreate > 0 ? (
            <button
              onClick={handleCreate}
              className="px-6 py-2.5 bg-ink text-cream text-xs font-medium rounded-full hover:bg-ink/90 transition-colors"
            >
              Create {willCreate} Lander{willCreate !== 1 ? 's' : ''}
            </button>
          ) : (
            <p className="text-xs text-warm-gray">All selected locations already have landers.</p>
          )}
        </div>
      </div>
    )
  }

  // --- Saving step ---
  if (step === 'saving') {
    const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

    return (
      <div className="text-center py-16">
        <div className="inline-block w-6 h-6 border-2 border-ink border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm text-warm-gray mb-2">Creating landers...</p>
        <div className="max-w-xs mx-auto">
          <div className="flex items-center justify-between text-[10px] text-warm-gray mb-1">
            <span>Created {progress.current} of {progress.total}</span>
            <span>{pct}%</span>
          </div>
          <div className="w-full h-1.5 bg-warm-border rounded-full overflow-hidden">
            <div
              className="h-full bg-ink rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    )
  }

  // --- Done step ---
  if (step === 'done' && result) {
    return (
      <div className="border border-warm-border rounded-xl p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-lg font-serif text-ink mb-2">Bulk Create Complete</h2>
        <p className="text-sm text-warm-gray mb-1">
          Created {result.created} lander{result.created !== 1 ? 's' : ''}.
          {result.skipped > 0 && ` ${result.skipped} skipped.`}
        </p>
        {result.errors > 0 && (
          <p className="text-xs text-amber-600 mb-4">
            {result.errors} had errors.
          </p>
        )}
        <p className="text-xs text-warm-gray mb-6">
          Each lander is now live at /l/[slug]. You can edit individual settings from each location&apos;s lander page.
        </p>
        <button
          onClick={() => router.push('/agency/locations')}
          className="px-6 py-2 bg-ink text-cream text-xs font-medium rounded-full hover:bg-ink/90 transition-colors"
        >
          View All Locations
        </button>
      </div>
    )
  }

  return null
}
