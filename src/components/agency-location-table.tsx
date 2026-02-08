'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Location {
  id: string
  name: string
  city: string | null
  state: string | null
  orgId: string
  orgName: string
  orgSlug: string
  reviews: number
  avgRating: string | null
  syncStatus: 'active' | 'pending' | 'error' | 'none'
}

interface Organization {
  id: string
  name: string
  slug: string
}

interface AgencyLocationTableProps {
  locations: Location[]
  orgs: Organization[]
}

type SortField = 'name' | 'orgName' | 'city' | 'reviews' | 'syncStatus'
type SortDirection = 'asc' | 'desc'

const ITEMS_PER_PAGE = 15

export function AgencyLocationTable({ locations, orgs }: AgencyLocationTableProps) {
  const router = useRouter()

  // Filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedOrgId, setSelectedOrgId] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [selectedCity, setSelectedCity] = useState<string>('all')

  // Sort state
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)

  // Selection state
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(new Set())

  // Bulk move state
  const [bulkMoveOrgId, setBulkMoveOrgId] = useState<string>('')
  const [isMoving, setIsMoving] = useState(false)
  const [moveProgress, setMoveProgress] = useState({ current: 0, total: 0 })

  // Kebab menu state
  const [activeKebabId, setActiveKebabId] = useState<string | null>(null)
  const [kebabMoveOrgId, setKebabMoveOrgId] = useState<string>('')

  // Get unique cities for filter
  const availableCities = useMemo(() => {
    const cities = new Set<string>()
    locations.forEach((loc) => {
      if (loc.city) cities.add(loc.city)
    })
    return Array.from(cities).sort()
  }, [locations])

  // Filter and sort locations
  const filteredAndSortedLocations = useMemo(() => {
    let filtered = locations.filter((loc) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesName = loc.name.toLowerCase().includes(query)
        const matchesOrg = loc.orgName.toLowerCase().includes(query)
        const matchesCity = loc.city?.toLowerCase().includes(query)
        if (!matchesName && !matchesOrg && !matchesCity) return false
      }

      // Org filter
      if (selectedOrgId !== 'all' && loc.orgId !== selectedOrgId) return false

      // Status filter
      if (selectedStatus !== 'all') {
        if (selectedStatus === 'synced' && loc.syncStatus !== 'active') return false
        if (selectedStatus === 'syncing' && loc.syncStatus !== 'pending') return false
        if (selectedStatus === 'not_connected' && loc.syncStatus !== 'none') return false
        if (selectedStatus === 'error' && loc.syncStatus !== 'error') return false
      }

      // City filter
      if (selectedCity !== 'all' && loc.city !== selectedCity) return false

      return true
    })

    // Sort
    filtered.sort((a, b) => {
      let aVal: any = a[sortField]
      let bVal: any = b[sortField]

      if (sortField === 'city') {
        aVal = aVal || ''
        bVal = bVal || ''
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }

      return 0
    })

    return filtered
  }, [locations, searchQuery, selectedOrgId, selectedStatus, selectedCity, sortField, sortDirection])

  // Paginate
  const totalPages = Math.ceil(filteredAndSortedLocations.length / ITEMS_PER_PAGE)
  const paginatedLocations = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredAndSortedLocations.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredAndSortedLocations, currentPage])

  // Reset to page 1 when filters change
  const handleFilterChange = (callback: () => void) => {
    callback()
    setCurrentPage(1)
  }

  // Sort handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const pageIds = new Set(paginatedLocations.map((loc) => loc.id))
      setSelectedLocationIds(pageIds)
    } else {
      setSelectedLocationIds(new Set())
    }
  }

  const handleSelectOne = (locationId: string, checked: boolean) => {
    const newSelection = new Set(selectedLocationIds)
    if (checked) {
      newSelection.add(locationId)
    } else {
      newSelection.delete(locationId)
    }
    setSelectedLocationIds(newSelection)
  }

  const allPageSelected = paginatedLocations.length > 0 &&
    paginatedLocations.every((loc) => selectedLocationIds.has(loc.id))

  // Bulk move handler
  const handleBulkMove = async () => {
    if (!bulkMoveOrgId || selectedLocationIds.size === 0) return

    setIsMoving(true)
    setMoveProgress({ current: 0, total: selectedLocationIds.size })

    const locationIds = Array.from(selectedLocationIds)
    let current = 0

    for (const locationId of locationIds) {
      current++
      setMoveProgress({ current, total: locationIds.length })

      try {
        const response = await fetch(`/api/locations/${locationId}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ org_id: bulkMoveOrgId })
        })

        if (!response.ok) {
          console.error(`Failed to move location ${locationId}`)
        }
      } catch (error) {
        console.error(`Error moving location ${locationId}:`, error)
      }
    }

    setIsMoving(false)
    setMoveProgress({ current: 0, total: 0 })
    setSelectedLocationIds(new Set())
    setBulkMoveOrgId('')
    router.refresh()
  }

  // Kebab menu handlers
  const handleKebabMove = async (locationId: string) => {
    if (!kebabMoveOrgId) return

    try {
      const response = await fetch(`/api/locations/${locationId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: kebabMoveOrgId })
      })

      if (response.ok) {
        setActiveKebabId(null)
        setKebabMoveOrgId('')
        router.refresh()
      }
    } catch (error) {
      console.error(`Error moving location:`, error)
    }
  }

  const getStatusBadge = (status: Location['syncStatus']) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
            Synced
          </span>
        )
      case 'pending':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
            Syncing
          </span>
        )
      case 'error':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
            Error
          </span>
        )
      case 'none':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
            Not connected
          </span>
        )
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <span className="text-warm-gray/40 ml-1">↕</span>
    }
    return <span className="text-ink ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search locations, orgs, cities..."
          value={searchQuery}
          onChange={(e) => handleFilterChange(() => setSearchQuery(e.target.value))}
          className="flex-1 px-3 py-2 border border-warm-border rounded-lg text-sm text-ink outline-none focus:ring-2 focus:ring-ink/20 placeholder:text-warm-gray"
        />

        <select
          value={selectedOrgId}
          onChange={(e) => handleFilterChange(() => setSelectedOrgId(e.target.value))}
          className="px-3 py-2 border border-warm-border rounded-lg text-sm bg-cream text-ink"
        >
          <option value="all">All Organizations</option>
          {orgs.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>

        <select
          value={selectedStatus}
          onChange={(e) => handleFilterChange(() => setSelectedStatus(e.target.value))}
          className="px-3 py-2 border border-warm-border rounded-lg text-sm bg-cream text-ink"
        >
          <option value="all">All Statuses</option>
          <option value="synced">Synced</option>
          <option value="syncing">Syncing</option>
          <option value="not_connected">Not connected</option>
          <option value="error">Error</option>
        </select>

        <select
          value={selectedCity}
          onChange={(e) => handleFilterChange(() => setSelectedCity(e.target.value))}
          className="px-3 py-2 border border-warm-border rounded-lg text-sm bg-cream text-ink"
        >
          <option value="all">All Cities</option>
          {availableCities.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="border border-warm-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-warm-light">
            <tr>
              <th className="text-left px-5 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="w-4 h-4 rounded border-warm-border text-ink focus:ring-ink/20"
                />
              </th>
              <th
                className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium cursor-pointer select-none hover:text-ink"
                onClick={() => handleSort('name')}
              >
                Location <SortIcon field="name" />
              </th>
              <th
                className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium cursor-pointer select-none hover:text-ink"
                onClick={() => handleSort('orgName')}
              >
                Organization <SortIcon field="orgName" />
              </th>
              <th
                className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium cursor-pointer select-none hover:text-ink"
                onClick={() => handleSort('city')}
              >
                City <SortIcon field="city" />
              </th>
              <th
                className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium cursor-pointer select-none hover:text-ink"
                onClick={() => handleSort('reviews')}
              >
                Reviews <SortIcon field="reviews" />
              </th>
              <th
                className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium cursor-pointer select-none hover:text-ink"
                onClick={() => handleSort('syncStatus')}
              >
                Status <SortIcon field="syncStatus" />
              </th>
              <th className="text-left px-5 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="bg-cream">
            {paginatedLocations.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-warm-gray text-sm">
                  No locations found
                </td>
              </tr>
            ) : (
              paginatedLocations.map((location) => (
                <tr
                  key={location.id}
                  className="border-b border-warm-border/50 hover:bg-warm-light/50"
                >
                  <td className="px-5 py-3">
                    <input
                      type="checkbox"
                      checked={selectedLocationIds.has(location.id)}
                      onChange={(e) => handleSelectOne(location.id, e.target.checked)}
                      className="w-4 h-4 rounded border-warm-border text-ink focus:ring-ink/20"
                    />
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/${location.orgSlug}/locations/${location.id}`}
                      className="text-ink font-medium hover:underline"
                    >
                      {location.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <div className="text-xs text-warm-gray">{location.orgName}</div>
                  </td>
                  <td className="px-5 py-3 text-sm text-ink">
                    {location.city || '—'}
                  </td>
                  <td className="px-5 py-3 text-sm text-ink">
                    {location.reviews > 0 ? (
                      <span>
                        {location.reviews}
                        {location.avgRating && (
                          <span className="text-warm-gray ml-1">
                            ({location.avgRating}★)
                          </span>
                        )}
                      </span>
                    ) : (
                      '0'
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {getStatusBadge(location.syncStatus)}
                  </td>
                  <td className="px-5 py-3 relative">
                    <button
                      onClick={() => setActiveKebabId(activeKebabId === location.id ? null : location.id)}
                      className="text-warm-gray hover:text-ink text-lg font-bold leading-none"
                    >
                      ⋮
                    </button>

                    {activeKebabId === location.id && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setActiveKebabId(null)}
                        />
                        <div className="absolute right-0 top-full mt-1 w-56 bg-cream border border-warm-border rounded-lg shadow-lg z-20 py-1">
                          <Link
                            href={`/admin/${location.orgSlug}/locations/${location.id}`}
                            className="block px-4 py-2 text-sm text-ink hover:bg-warm-light"
                            onClick={() => setActiveKebabId(null)}
                          >
                            View Location
                          </Link>
                          <Link
                            href={`/admin/${location.orgSlug}/locations/${location.id}/settings`}
                            className="block px-4 py-2 text-sm text-ink hover:bg-warm-light"
                            onClick={() => setActiveKebabId(null)}
                          >
                            Edit Settings
                          </Link>
                          <div className="border-t border-warm-border my-1" />
                          <div className="px-4 py-2">
                            <div className="text-xs text-warm-gray mb-2">Move to:</div>
                            <select
                              value={kebabMoveOrgId}
                              onChange={(e) => setKebabMoveOrgId(e.target.value)}
                              className="w-full px-2 py-1 border border-warm-border rounded text-sm bg-cream text-ink"
                            >
                              <option value="">Select org...</option>
                              {orgs
                                .filter((org) => org.id !== location.orgId)
                                .map((org) => (
                                  <option key={org.id} value={org.id}>
                                    {org.name}
                                  </option>
                                ))}
                            </select>
                            <button
                              onClick={() => handleKebabMove(location.id)}
                              disabled={!kebabMoveOrgId}
                              className="w-full mt-2 px-3 py-1 bg-ink text-cream text-sm rounded hover:bg-ink/90 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Move
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-5 py-3 border border-warm-border rounded-lg">
        <div className="text-sm text-warm-gray">
          Showing {filteredAndSortedLocations.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1}–
          {Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSortedLocations.length)} of{' '}
          {filteredAndSortedLocations.length}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1 text-sm text-ink border border-warm-border rounded hover:bg-warm-light disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <button
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="px-3 py-1 text-sm text-ink border border-warm-border rounded hover:bg-warm-light disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedLocationIds.size > 0 && (
        <div className="sticky bottom-0 bg-ink text-cream px-5 py-3 rounded-t-xl flex items-center gap-4">
          <span className="font-medium">
            {selectedLocationIds.size} selected
          </span>

          {isMoving ? (
            <span className="text-sm">
              Moving {moveProgress.current} of {moveProgress.total}...
            </span>
          ) : (
            <>
              <select
                value={bulkMoveOrgId}
                onChange={(e) => setBulkMoveOrgId(e.target.value)}
                className="px-3 py-1.5 border border-cream/20 rounded bg-ink text-cream text-sm"
              >
                <option value="">Move to...</option>
                {orgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>

              <button
                onClick={handleBulkMove}
                disabled={!bulkMoveOrgId}
                className="px-4 py-1.5 bg-cream text-ink text-sm font-medium rounded hover:bg-cream/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Move
              </button>

              <button
                onClick={() => setSelectedLocationIds(new Set())}
                className="ml-auto px-3 py-1.5 text-sm text-cream/80 hover:text-cream"
              >
                Clear
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
