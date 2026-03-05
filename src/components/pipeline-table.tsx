'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { PHASE_LABELS, type SetupPhase } from '@/lib/pipeline'

interface PipelineRow {
  id: string
  name: string
  city: string | null
  state: string | null
  orgName: string
  orgSlug: string
  progress: number
  currentPhase: SetupPhase | null
  currentPhaseStatus: string | null
  failedCount: number
  setupStatus: string
  hasPhases: boolean
}

type FilterStatus = 'all' | 'not_started' | 'in_progress' | 'blocked' | 'complete'

export function PipelineTable({ rows }: { rows: PipelineRow[] }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [sortBy, setSortBy] = useState<'name' | 'progress' | 'org'>('progress')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const filtered = useMemo(() => {
    let result = rows

    if (search) {
      const q = search.toLowerCase()
      result = result.filter((r) =>
        r.name.toLowerCase().includes(q) ||
        r.orgName.toLowerCase().includes(q) ||
        (r.city && r.city.toLowerCase().includes(q))
      )
    }

    switch (filter) {
      case 'not_started':
        result = result.filter((r) => r.progress === 0 || !r.hasPhases)
        break
      case 'in_progress':
        result = result.filter((r) => r.progress > 0 && r.progress < 100 && r.failedCount === 0)
        break
      case 'blocked':
        result = result.filter((r) => r.failedCount > 0)
        break
      case 'complete':
        result = result.filter((r) => r.progress === 100)
        break
    }

    result.sort((a, b) => {
      let cmp = 0
      switch (sortBy) {
        case 'name': cmp = a.name.localeCompare(b.name); break
        case 'progress': cmp = a.progress - b.progress; break
        case 'org': cmp = a.orgName.localeCompare(b.orgName); break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [rows, search, filter, sortBy, sortDir])

  const handleSort = (field: 'name' | 'progress' | 'org') => {
    if (sortBy === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDir('asc')
    }
  }

  const filterCounts = useMemo(() => ({
    all: rows.length,
    not_started: rows.filter((r) => r.progress === 0 || !r.hasPhases).length,
    in_progress: rows.filter((r) => r.progress > 0 && r.progress < 100 && r.failedCount === 0).length,
    blocked: rows.filter((r) => r.failedCount > 0).length,
    complete: rows.filter((r) => r.progress === 100).length,
  }), [rows])

  return (
    <div>
      {/* Search + Filters */}
      <div className="flex items-center gap-4 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search locations or orgs..."
          className="flex-1 max-w-xs px-3 py-2 text-sm border border-warm-border rounded-lg focus:outline-none focus:border-ink bg-transparent"
        />
        <div className="flex gap-1">
          {(['all', 'not_started', 'in_progress', 'blocked', 'complete'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                filter === f
                  ? 'bg-ink text-cream border-ink'
                  : 'border-warm-border text-warm-gray hover:text-ink hover:border-ink'
              }`}
            >
              {f === 'all' ? 'All' : f === 'not_started' ? 'Not Started' : f === 'in_progress' ? 'In Progress' : f === 'blocked' ? 'Blocked' : 'Complete'}
              <span className="ml-1 opacity-60">{filterCounts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="border border-warm-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-warm-border">
              <th
                className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium cursor-pointer hover:text-ink"
                onClick={() => handleSort('name')}
              >
                Location {sortBy === 'name' && (sortDir === 'asc' ? '▲' : '▼')}
              </th>
              <th
                className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium cursor-pointer hover:text-ink"
                onClick={() => handleSort('org')}
              >
                Organization {sortBy === 'org' && (sortDir === 'asc' ? '▲' : '▼')}
              </th>
              <th className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium">
                Current Phase
              </th>
              <th
                className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium cursor-pointer hover:text-ink w-40"
                onClick={() => handleSort('progress')}
              >
                Progress {sortBy === 'progress' && (sortDir === 'asc' ? '▲' : '▼')}
              </th>
              <th className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-warm-gray text-sm">
                  No locations match your filters.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="border-b border-warm-border/50 hover:bg-warm-light/50">
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/admin/${row.orgSlug}/locations/${row.id}`}
                      className="text-sm font-medium text-ink no-underline hover:underline"
                    >
                      {row.name}
                    </Link>
                    {row.city && row.state && (
                      <div className="text-xs text-warm-gray mt-0.5">{row.city}, {row.state}</div>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-warm-gray">{row.orgName}</td>
                  <td className="px-5 py-3.5">
                    {row.progress === 100 ? (
                      <span className="text-xs text-emerald-600 font-medium">Complete</span>
                    ) : row.currentPhase ? (
                      <div className="flex items-center gap-1.5">
                        {row.failedCount > 0 && (
                          <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        )}
                        {row.currentPhaseStatus === 'running' && (
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        )}
                        <span className="text-xs text-ink">{PHASE_LABELS[row.currentPhase]}</span>
                        {row.failedCount > 0 && (
                          <span className="text-[10px] text-red-500">({row.failedCount} failed)</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-warm-gray">Not started</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-warm-border rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            row.progress === 100 ? 'bg-emerald-500' :
                            row.failedCount > 0 ? 'bg-red-400' : 'bg-ink'
                          }`}
                          style={{ width: `${row.progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-warm-gray w-7 text-right">{row.progress}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/admin/${row.orgSlug}/locations/${row.id}`}
                      className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-2 text-xs text-warm-gray">
        Showing {filtered.length} of {rows.length} locations
      </div>
    </div>
  )
}
