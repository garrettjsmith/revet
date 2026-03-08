'use client'

import { useState, useEffect, useCallback } from 'react'

interface KeywordConfig {
  id: string
  keyword: string
  campaign_id: string | null
  grid_size: number
  radius_km: number
  frequency: string
  active: boolean
  created_at: string
}

interface ScanData {
  solv: number
  arp: number
  scanned_at: string
}

interface Props {
  locationId: string
}

export function RankKeywordsManager({ locationId }: Props) {
  const [configs, setConfigs] = useState<KeywordConfig[]>([])
  const [scans, setScans] = useState<Record<string, ScanData>>({})
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/locations/${locationId}/rank-keywords`)
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setConfigs(data.configs || [])
      setScans(data.scans || {})
    } catch {
      setError('Failed to load keyword configs')
    } finally {
      setLoading(false)
    }
  }, [locationId])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!keyword.trim()) return
    setAdding(true)
    setError(null)

    try {
      const res = await fetch(`/api/locations/${locationId}/rank-keywords`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: keyword.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to add keyword')
      }
      setKeyword('')
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add keyword')
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(id: string) {
    try {
      const res = await fetch(`/api/locations/${locationId}/rank-keywords`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('Failed to remove')
      await fetchData()
    } catch {
      setError('Failed to remove keyword')
    }
  }

  if (loading) {
    return (
      <div className="border border-warm-border rounded-xl p-5">
        <h2 className="text-sm font-medium text-ink mb-3">Rank Tracking Keywords</h2>
        <p className="text-xs text-warm-gray">Loading...</p>
      </div>
    )
  }

  return (
    <div className="border border-warm-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-medium text-ink">Rank Tracking Keywords</h2>
        <span className="text-[10px] text-warm-gray">{configs.length} keyword{configs.length !== 1 ? 's' : ''}</span>
      </div>
      <p className="text-[10px] text-warm-gray mb-4">
        Keywords tracked via LocalFalcon geo-grid scans
      </p>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">
          {error}
        </div>
      )}

      {configs.length > 0 && (
        <div className="space-y-2 mb-4">
          {configs.map((config) => {
            const scanData = scans[config.keyword.toLowerCase()]
            return (
              <div
                key={config.id}
                className="flex items-center justify-between gap-3 px-3 py-2 bg-cream/50 rounded-lg border border-warm-border/50"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-ink font-medium truncate">{config.keyword}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-warm-gray">{config.frequency}</span>
                    {config.campaign_id && (
                      <span className="text-[10px] text-emerald-600">Campaign active</span>
                    )}
                    {!config.campaign_id && (
                      <span className="text-[10px] text-amber-600">No campaign</span>
                    )}
                  </div>
                </div>
                {scanData && (
                  <div className="text-right shrink-0">
                    <div className="text-xs text-ink font-medium">{scanData.solv?.toFixed(1)}% SoLV</div>
                    <div className="text-[10px] text-warm-gray">ARP {scanData.arp?.toFixed(1)}</div>
                  </div>
                )}
                <button
                  onClick={() => handleRemove(config.id)}
                  className="text-warm-gray hover:text-red-500 transition-colors shrink-0"
                  title="Remove keyword"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      )}

      <form onSubmit={handleAdd} className="flex items-center gap-2">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Add keyword to track..."
          className="flex-1 px-3 py-1.5 text-xs border border-warm-border rounded-full bg-white focus:outline-none focus:ring-1 focus:ring-ink/20 placeholder:text-warm-gray/60"
        />
        <button
          type="submit"
          disabled={adding || !keyword.trim()}
          className="px-4 py-1.5 text-xs font-medium bg-ink text-white rounded-full hover:bg-ink/90 disabled:opacity-40 transition-colors"
        >
          {adding ? 'Adding...' : 'Add'}
        </button>
      </form>
    </div>
  )
}
