'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Location } from '@/lib/types'

const TYPE_LABELS: Record<string, string> = {
  place: 'Place',
  practitioner: 'Practitioner',
  service_area: 'Service Area',
}

interface LocationTableProps {
  locations: Array<{
    location: Location
    reviews: number
    avgRating: string
    synced: boolean
    syncStatus: string | null
    hasSource: boolean
    category: string | null
    gbpStatus: string | null
  }>
  orgSlug: string
  compact?: boolean
  isAgencyAdmin?: boolean
  allOrgs?: Array<{ id: string; name: string; slug: string }>
}

type SortField = 'name' | 'reviews' | 'rating'
type SortDirection = 'asc' | 'desc'
type SyncFilter = 'all' | 'synced' | 'pending' | 'error' | 'not_connected'

export function LocationTable({ locations, orgSlug, compact = false, isAgencyAdmin = false, allOrgs = [] }: LocationTableProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [syncFilter, setSyncFilter] = useState<SyncFilter>('all')
  const [cityFilter, setCityFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [groupByCity, setGroupByCity] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [collapsedCities, setCollapsedCities] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openKebab, setOpenKebab] = useState<string | null>(null)
  const [bulkMoveTargetOrg, setBulkMoveTargetOrg] = useState<string>('')
  const [bulkMoveProgress, setBulkMoveProgress] = useState<{ current: number; total: number } | null>(null)
  const [moveMessage, setMoveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const itemsPerPage = 15
  const basePath = `/admin/${orgSlug}`

  // Extract unique cities and types
  const cities = useMemo(() => {
    const citySet = new Set<string>()
    locations.forEach((loc) => {
      if (loc.location.city) {
        citySet.add(loc.location.city)
      }
    })
    return Array.from(citySet).sort()
  }, [locations])

  const types = useMemo(() => {
    const typeSet = new Set<string>()
    locations.forEach((loc) => {
      typeSet.add(loc.location.type)
    })
    return Array.from(typeSet).sort()
  }, [locations])

  // Filter and search
  const filteredLocations = useMemo(() => {
    return locations.filter((loc) => {
      // Search filter
      if (searchQuery && !loc.location.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false
      }

      // Sync status filter
      if (syncFilter !== 'all') {
        if (syncFilter === 'synced' && loc.syncStatus !== 'active') return false
        if (syncFilter === 'pending' && loc.syncStatus !== 'pending') return false
        if (syncFilter === 'error' && loc.syncStatus !== 'error') return false
        if (syncFilter === 'not_connected' && loc.hasSource) return false
      }

      // City filter
      if (cityFilter !== 'all' && loc.location.city !== cityFilter) {
        return false
      }

      // Type filter
      if (typeFilter !== 'all' && loc.location.type !== typeFilter) {
        return false
      }

      return true
    })
  }, [locations, searchQuery, syncFilter, cityFilter, typeFilter])

  // Sort
  const sortedLocations = useMemo(() => {
    const sorted = [...filteredLocations]
    sorted.sort((a, b) => {
      let aVal: string | number
      let bVal: string | number

      if (sortField === 'name') {
        aVal = a.location.name.toLowerCase()
        bVal = b.location.name.toLowerCase()
      } else if (sortField === 'reviews') {
        aVal = a.reviews
        bVal = b.reviews
      } else {
        // rating
        aVal = a.avgRating === '—' ? -1 : parseFloat(a.avgRating)
        bVal = b.avgRating === '—' ? -1 : parseFloat(b.avgRating)
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [filteredLocations, sortField, sortDirection])

  // Group by city
  const groupedLocations = useMemo(() => {
    if (!groupByCity) return null

    const groups = new Map<string, typeof sortedLocations>()
    sortedLocations.forEach((loc) => {
      const city = loc.location.city || 'Unknown City'
      if (!groups.has(city)) {
        groups.set(city, [])
      }
      groups.get(city)!.push(loc)
    })

    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [sortedLocations, groupByCity])

  // Paginate
  const totalPages = Math.ceil(sortedLocations.length / itemsPerPage)
  const paginatedLocations = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    const end = start + itemsPerPage
    return sortedLocations.slice(start, end)
  }, [sortedLocations, currentPage])

  // Reset to page 1 when filters change
  const handleFilterChange = () => {
    setCurrentPage(1)
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const toggleCityCollapse = (city: string) => {
    const newCollapsed = new Set(collapsedCities)
    if (newCollapsed.has(city)) {
      newCollapsed.delete(city)
    } else {
      newCollapsed.add(city)
    }
    setCollapsedCities(newCollapsed)
  }

  // Bulk selection handlers
  const toggleSelect = (locationId: string) => {
    const newSelected = new Set(selected)
    if (newSelected.has(locationId)) {
      newSelected.delete(locationId)
    } else {
      newSelected.add(locationId)
    }
    setSelected(newSelected)
  }

  const toggleSelectAll = () => {
    const pageLocationIds = paginatedLocations.map((loc) => loc.location.id)
    const allSelectedOnPage = pageLocationIds.every((id) => selected.has(id))

    if (allSelectedOnPage) {
      // Deselect all on current page
      const newSelected = new Set(selected)
      pageLocationIds.forEach((id) => newSelected.delete(id))
      setSelected(newSelected)
    } else {
      // Select all on current page
      const newSelected = new Set(selected)
      pageLocationIds.forEach((id) => newSelected.add(id))
      setSelected(newSelected)
    }
  }

  const clearSelection = () => {
    setSelected(new Set())
    setBulkMoveTargetOrg('')
    setMoveMessage(null)
  }

  // Bulk move execution
  const executeBulkMove = async () => {
    if (!bulkMoveTargetOrg || selected.size === 0) return

    setBulkMoveProgress({ current: 0, total: selected.size })
    setMoveMessage(null)

    const selectedIds = Array.from(selected)
    let successCount = 0
    let errorCount = 0

    for (let i = 0; i < selectedIds.length; i++) {
      const locationId = selectedIds[i]
      setBulkMoveProgress({ current: i + 1, total: selected.size })

      try {
        const res = await fetch(`/api/locations/${locationId}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ org_id: bulkMoveTargetOrg }),
        })

        if (res.ok) {
          successCount++
        } else {
          errorCount++
        }
      } catch (err) {
        errorCount++
      }
    }

    setBulkMoveProgress(null)
    clearSelection()

    if (errorCount === 0) {
      setMoveMessage({ type: 'success', text: `Successfully moved ${successCount} location${successCount === 1 ? '' : 's'}` })
    } else {
      setMoveMessage({ type: 'error', text: `Moved ${successCount} location${successCount === 1 ? '' : 's'}, ${errorCount} failed` })
    }

    router.refresh()

    // Clear message after 5 seconds
    setTimeout(() => setMoveMessage(null), 5000)
  }

  const renderSyncStatus = (loc: LocationTableProps['locations'][0]) => {
    if (loc.syncStatus === 'active') {
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-600">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Synced
        </span>
      )
    }
    if (loc.syncStatus === 'error') {
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-red-600">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          Error
        </span>
      )
    }
    if (loc.syncStatus === 'paused') {
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] text-warm-gray">
          <span className="w-1.5 h-1.5 rounded-full bg-warm-border" />
          Paused
        </span>
      )
    }
    if (loc.syncStatus === 'pending' || loc.hasSource) {
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-amber-600">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Pending
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] text-warm-gray">
        <span className="w-1.5 h-1.5 rounded-full bg-warm-border" />
        Not connected
      </span>
    )
  }

  const renderLocationRow = (loc: LocationTableProps['locations'][0], showType = true) => {
    const isSelected = selected.has(loc.location.id)
    const kebabOpen = openKebab === loc.location.id

    return (
      <tr key={loc.location.id} className="border-b border-warm-border/50 hover:bg-warm-light/50">
        {isAgencyAdmin && allOrgs.length > 0 && (
          <td className="px-5 py-3.5 w-10">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelect(loc.location.id)}
              className="w-4 h-4 cursor-pointer"
            />
          </td>
        )}
        <td className="px-5 py-3.5">
          <Link
            href={`${basePath}/locations/${loc.location.id}`}
            className="text-sm font-medium text-ink no-underline hover:underline"
          >
            {loc.location.name}
          </Link>
          <div className="text-xs text-warm-gray mt-0.5 flex items-center gap-2">
            {loc.location.city && loc.location.state && (
              <span>
                {loc.location.city}, {loc.location.state}
              </span>
            )}
          </div>
        </td>
        {showType ? (
          <td className="px-5 py-3.5 text-xs text-warm-gray">{TYPE_LABELS[loc.location.type]}</td>
        ) : (
          <td className="px-5 py-3.5 text-xs text-warm-gray">{loc.category || '—'}</td>
        )}
        <td className="px-5 py-3.5 font-mono text-sm text-ink">{loc.reviews}</td>
        <td className="px-5 py-3.5 font-mono text-sm text-ink">{loc.avgRating}</td>
        <td className="px-5 py-3.5">{renderSyncStatus(loc)}</td>
        <td className="px-5 py-3.5 relative">
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => setOpenKebab(kebabOpen ? null : loc.location.id)}
              className="text-warm-gray hover:text-ink w-6 h-6 flex items-center justify-center"
            >
              ⋮
            </button>
            {kebabOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setOpenKebab(null)}
                />
                <div className="absolute right-0 top-full mt-1 bg-cream border border-warm-border rounded-lg shadow-lg py-1 z-20 min-w-[160px]">
                  <Link
                    href={`${basePath}/locations/${loc.location.id}`}
                    className="block px-3 py-1.5 text-sm text-warm-gray hover:text-ink hover:bg-warm-light no-underline"
                    onClick={() => setOpenKebab(null)}
                  >
                    View
                  </Link>
                  <Link
                    href={`${basePath}/locations/${loc.location.id}/settings`}
                    className="block px-3 py-1.5 text-sm text-warm-gray hover:text-ink hover:bg-warm-light no-underline"
                    onClick={() => setOpenKebab(null)}
                  >
                    Edit
                  </Link>
                  {isAgencyAdmin && allOrgs.length > 0 && (
                    <div className="border-t border-warm-border my-1">
                      <div className="px-3 py-1.5 text-xs text-warm-gray">Move to...</div>
                      <div className="max-h-48 overflow-y-auto">
                        {allOrgs.map((org) => (
                          <button
                            key={org.id}
                            onClick={async () => {
                              setOpenKebab(null)
                              try {
                                const res = await fetch(`/api/locations/${loc.location.id}/move`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ org_id: org.id }),
                                })
                                if (res.ok) {
                                  setMoveMessage({ type: 'success', text: `Moved to ${org.name}` })
                                  router.refresh()
                                  setTimeout(() => setMoveMessage(null), 5000)
                                } else {
                                  setMoveMessage({ type: 'error', text: 'Failed to move location' })
                                  setTimeout(() => setMoveMessage(null), 5000)
                                }
                              } catch (err) {
                                setMoveMessage({ type: 'error', text: 'Failed to move location' })
                                setTimeout(() => setMoveMessage(null), 5000)
                              }
                            }}
                            className="w-full text-left px-4 py-1.5 text-sm text-warm-gray hover:text-ink hover:bg-warm-light"
                          >
                            {org.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </td>
      </tr>
    )
  }

  const renderTable = (locs: typeof paginatedLocations, showType = true) => {
    const pageLocationIds = locs.map((loc) => loc.location.id)
    const allSelectedOnPage = pageLocationIds.length > 0 && pageLocationIds.every((id) => selected.has(id))
    const someSelectedOnPage = pageLocationIds.some((id) => selected.has(id))
    const colSpan = isAgencyAdmin && allOrgs.length > 0 ? 7 : 6

    return (
      <table className="w-full">
        <thead>
          <tr className="border-b border-warm-border">
            {isAgencyAdmin && allOrgs.length > 0 && (
              <th className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium w-10">
                <input
                  type="checkbox"
                  checked={allSelectedOnPage}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelectedOnPage && !allSelectedOnPage
                  }}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 cursor-pointer"
                />
              </th>
            )}
            <th
              className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium cursor-pointer hover:text-ink"
              onClick={() => handleSort('name')}
            >
              Location {sortField === 'name' && (sortDirection === 'asc' ? '▲' : '▼')}
            </th>
            <th className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium">
              {showType ? 'Type' : 'Category'}
            </th>
            <th
              className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium cursor-pointer hover:text-ink"
              onClick={() => handleSort('reviews')}
            >
              Reviews {sortField === 'reviews' && (sortDirection === 'asc' ? '▲' : '▼')}
            </th>
            <th
              className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium cursor-pointer hover:text-ink"
              onClick={() => handleSort('rating')}
            >
              {showType ? 'Rating' : 'Avg Rating'} {sortField === 'rating' && (sortDirection === 'asc' ? '▲' : '▼')}
            </th>
            <th className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium">
              {showType ? 'GBP' : 'Status'}
            </th>
            <th className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {locs.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="p-8 text-center text-warm-gray text-sm">
                No locations found.
              </td>
            </tr>
          ) : (
            locs.map((loc) => renderLocationRow(loc, showType))
          )}
        </tbody>
      </table>
    )
  }

  return (
    <div>
      {/* Search bar */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search locations..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            handleFilterChange()
          }}
          className="w-full px-3 py-2 border border-warm-border rounded-lg text-sm text-ink outline-none focus:ring-2 focus:ring-ink/20 placeholder:text-warm-gray"
        />
      </div>

      {/* Filter chips (not shown in compact mode) */}
      {!compact && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-warm-gray">Sync:</span>
            {(['all', 'synced', 'pending', 'error', 'not_connected'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => {
                  setSyncFilter(filter)
                  handleFilterChange()
                }}
                className={
                  syncFilter === filter
                    ? 'bg-ink text-cream px-3 py-1 rounded-full text-xs'
                    : 'border border-warm-border text-warm-gray hover:text-ink px-3 py-1 rounded-full text-xs'
                }
              >
                {filter === 'all' ? 'All' : filter === 'synced' ? 'Synced' : filter === 'pending' ? 'Pending' : filter === 'error' ? 'Error' : 'Not connected'}
              </button>
            ))}
          </div>

          {cities.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-warm-gray">City:</span>
              <button
                onClick={() => {
                  setCityFilter('all')
                  handleFilterChange()
                }}
                className={
                  cityFilter === 'all'
                    ? 'bg-ink text-cream px-3 py-1 rounded-full text-xs'
                    : 'border border-warm-border text-warm-gray hover:text-ink px-3 py-1 rounded-full text-xs'
                }
              >
                All
              </button>
              {cities.map((city) => (
                <button
                  key={city}
                  onClick={() => {
                    setCityFilter(city)
                    handleFilterChange()
                  }}
                  className={
                    cityFilter === city
                      ? 'bg-ink text-cream px-3 py-1 rounded-full text-xs'
                      : 'border border-warm-border text-warm-gray hover:text-ink px-3 py-1 rounded-full text-xs'
                  }
                >
                  {city}
                </button>
              ))}
            </div>
          )}

          {types.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-warm-gray">Type:</span>
              <button
                onClick={() => {
                  setTypeFilter('all')
                  handleFilterChange()
                }}
                className={
                  typeFilter === 'all'
                    ? 'bg-ink text-cream px-3 py-1 rounded-full text-xs'
                    : 'border border-warm-border text-warm-gray hover:text-ink px-3 py-1 rounded-full text-xs'
                }
              >
                All
              </button>
              {types.map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    setTypeFilter(type)
                    handleFilterChange()
                  }}
                  className={
                    typeFilter === type
                      ? 'bg-ink text-cream px-3 py-1 rounded-full text-xs'
                      : 'border border-warm-border text-warm-gray hover:text-ink px-3 py-1 rounded-full text-xs'
                  }
                >
                  {TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          )}

          {cities.length > 1 && (
            <div className="ml-auto">
              <button
                onClick={() => setGroupByCity(!groupByCity)}
                className={
                  groupByCity
                    ? 'bg-ink text-cream px-3 py-1 rounded-full text-xs'
                    : 'border border-warm-border text-warm-gray hover:text-ink px-3 py-1 rounded-full text-xs'
                }
              >
                Group by city
              </button>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="border border-warm-border rounded-xl overflow-hidden">
        {groupByCity && groupedLocations ? (
          <div>
            {groupedLocations.map(([city, cityLocs]) => {
              const isCollapsed = collapsedCities.has(city)
              return (
                <div key={city}>
                  <div
                    className="text-xs font-medium text-warm-gray uppercase tracking-wider px-5 py-2 bg-warm-light/50 cursor-pointer hover:bg-warm-light flex items-center justify-between"
                    onClick={() => toggleCityCollapse(city)}
                  >
                    <span>
                      {city} ({cityLocs.length})
                    </span>
                    <span className="text-[10px]">{isCollapsed ? '▼' : '▲'}</span>
                  </div>
                  {!isCollapsed && renderTable(cityLocs, !compact)}
                </div>
              )
            })}
          </div>
        ) : (
          renderTable(paginatedLocations, !compact)
        )}
      </div>

      {/* Pagination (only show if not grouping) */}
      {!groupByCity && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 text-xs text-warm-gray hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed border border-warm-border rounded-full"
          >
            Prev
          </button>
          <span className="text-sm text-warm-gray">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 text-xs text-warm-gray hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed border border-warm-border rounded-full"
          >
            Next
          </button>
        </div>
      )}

      {/* Move message */}
      {moveMessage && (
        <div className="mt-4">
          <div
            className={`px-4 py-2 rounded-lg text-sm ${
              moveMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {moveMessage.text}
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {isAgencyAdmin && allOrgs.length > 0 && selected.size > 0 && (
        <div className="sticky bottom-0 left-0 right-0 bg-ink text-cream px-5 py-3 rounded-t-xl flex items-center gap-4 mt-6 shadow-lg">
          <span className="text-sm font-medium">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm">Move to:</span>
            <select
              value={bulkMoveTargetOrg}
              onChange={(e) => setBulkMoveTargetOrg(e.target.value)}
              className="bg-ink border border-cream/20 text-cream text-sm rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-cream/40"
              disabled={bulkMoveProgress !== null}
            >
              <option value="">Select org...</option>
              {allOrgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
            <button
              onClick={executeBulkMove}
              disabled={!bulkMoveTargetOrg || bulkMoveProgress !== null}
              className="px-4 py-1.5 bg-cream text-ink text-sm font-medium rounded-full hover:bg-cream/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {bulkMoveProgress
                ? `Moving ${bulkMoveProgress.current} of ${bulkMoveProgress.total}...`
                : 'Move'}
            </button>
          </div>
          <button
            onClick={clearSelection}
            disabled={bulkMoveProgress !== null}
            className="ml-auto text-sm text-cream/70 hover:text-cream disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  )
}
