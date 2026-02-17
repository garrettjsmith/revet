'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface FieldDiff {
  field: string
  label: string
  currentValue: string | null
  googleValue: string | null
}

interface Props {
  locationId: string
}

export function GoogleUpdatesBanner({ locationId }: Props) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [diffs, setDiffs] = useState<FieldDiff[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [acting, setActing] = useState(false)

  const handleExpand = async () => {
    if (expanded) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    setLoading(true)
    try {
      const res = await fetch(`/api/locations/${locationId}/gbp-profile/google-updates`)
      const data = await res.json()
      setDiffs(data.diffs || [])
    } catch {
      setDiffs([])
    }
    setLoading(false)
  }

  const handleAction = async (action: 'accept' | 'reject') => {
    setActing(true)
    try {
      await fetch(`/api/locations/${locationId}/gbp-profile/google-updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      router.refresh()
    } catch {
      // Silent fail
    }
    setActing(false)
  }

  return (
    <div className="border border-blue-200 bg-blue-50/50 rounded-xl overflow-hidden">
      <button
        onClick={handleExpand}
        className="w-full px-5 py-3 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-sm font-medium text-blue-700">
            Google has suggested changes to this profile
          </span>
        </div>
        <span className="text-xs text-blue-500">
          {expanded ? 'Collapse' : 'Review changes'}
        </span>
      </button>

      {expanded && (
        <div className="px-5 pb-4 border-t border-blue-200">
          {loading ? (
            <div className="py-4 text-xs text-blue-500">Loading changes...</div>
          ) : diffs && diffs.length > 0 ? (
            <div className="space-y-3 pt-3">
              {diffs.map((d) => (
                <div key={d.field} className="text-xs">
                  <div className="font-medium text-ink mb-1">{d.label}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-lg p-2 border border-warm-border">
                      <div className="text-[10px] text-warm-gray uppercase tracking-wider mb-0.5">Current</div>
                      <div className="text-ink">{d.currentValue || '(empty)'}</div>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-2 border border-blue-200">
                      <div className="text-[10px] text-blue-500 uppercase tracking-wider mb-0.5">Google suggests</div>
                      <div className="text-ink">{d.googleValue || '(empty)'}</div>
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => handleAction('accept')}
                  disabled={acting}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-full transition-colors disabled:opacity-50"
                >
                  {acting ? 'Processing...' : 'Accept Changes'}
                </button>
                <button
                  onClick={() => handleAction('reject')}
                  disabled={acting}
                  className="px-4 py-1.5 border border-warm-border text-warm-gray text-xs rounded-full hover:text-ink hover:border-ink transition-colors disabled:opacity-50"
                >
                  Reject & Keep Current
                </button>
              </div>
            </div>
          ) : (
            <div className="py-4 text-xs text-warm-gray">
              No field-level differences detected. The update may have already been resolved.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
