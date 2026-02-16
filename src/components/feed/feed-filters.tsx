'use client'

import { useState, useCallback } from 'react'
import { SearchableSelect } from './searchable-select'

interface OrgOption {
  id: string
  name: string
  slug: string
}

interface LocationOption {
  id: string
  name: string
  city: string | null
  state: string | null
}

interface FeedFiltersProps {
  org: OrgOption | null
  location: LocationOption | null
  onOrgChange: (org: OrgOption | null) => void
  onLocationChange: (loc: LocationOption | null) => void
}

export function FeedFilters({ org, location, onOrgChange, onLocationChange }: FeedFiltersProps) {
  const [expanded, setExpanded] = useState(false)

  const fetchOrgs = useCallback(async (q: string, offset: number) => {
    const params = new URLSearchParams({ offset: String(offset), limit: '20' })
    if (q) params.set('q', q)
    const res = await fetch(`/api/agency/orgs/search?${params}`)
    const data = await res.json()
    return { items: data.orgs as OrgOption[], has_more: data.has_more }
  }, [])

  const fetchLocations = useCallback(async (q: string, offset: number) => {
    const params = new URLSearchParams({ offset: String(offset), limit: '20' })
    if (q) params.set('q', q)
    if (org) params.set('org_id', org.id)
    const res = await fetch(`/api/agency/locations/search?${params}`)
    const data = await res.json()
    return { items: data.locations as LocationOption[], has_more: data.has_more }
  }, [org])

  const handleOrgChange = (newOrg: OrgOption | null) => {
    onOrgChange(newOrg)
    // Clear location when org changes
    if (!newOrg || (org && newOrg.id !== org.id)) {
      onLocationChange(null)
    }
  }

  const hasFilters = org || location

  return (
    <div className="border-b border-warm-border/50">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-2 text-xs text-warm-gray hover:text-ink transition-colors"
      >
        <span className="flex items-center gap-1.5">
          Filters
          {hasFilters && (
            <span className="w-1.5 h-1.5 rounded-full bg-ink" />
          )}
        </span>
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-5 pb-3 flex flex-col sm:flex-row gap-2">
          <div className="flex-1 min-w-0">
            <label className="text-[10px] text-warm-gray uppercase tracking-wider mb-1 block">Organization</label>
            <SearchableSelect
              placeholder="All organizations"
              value={org}
              onChange={handleOrgChange}
              fetchFn={fetchOrgs}
              getLabel={(o) => o.name}
              getId={(o) => o.id}
            />
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-[10px] text-warm-gray uppercase tracking-wider mb-1 block">Location</label>
            <SearchableSelect
              placeholder={org ? 'All locations' : 'Select org first'}
              value={location}
              onChange={onLocationChange}
              fetchFn={fetchLocations}
              getLabel={(l) => l.city ? `${l.name} — ${l.city}, ${l.state || ''}` : l.name}
              getId={(l) => l.id}
            />
          </div>
        </div>
      )}
    </div>
  )
}
