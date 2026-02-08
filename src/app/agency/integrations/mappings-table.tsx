'use client'

import { useState } from 'react'

const PAGE_SIZE = 10

interface MappingsTableProps {
  mappings: Array<{
    id: string
    external_resource_id: string
    external_resource_name?: string | null
    organizations?: { name: string; slug: string } | null
    locations?: { name: string } | null
  }>
  scope: string
}

export function MappingsTable({ mappings, scope }: MappingsTableProps) {
  const [page, setPage] = useState(0)
  const totalPages = Math.ceil(mappings.length / PAGE_SIZE)
  const paginated = mappings.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="border border-warm-border/50 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-warm-border/50">
            <th className="text-left px-4 py-2 text-[10px] text-warm-gray uppercase tracking-wider font-medium">Resource</th>
            <th className="text-left px-4 py-2 text-[10px] text-warm-gray uppercase tracking-wider font-medium">
              {scope === 'org' ? 'Organization' : 'Location'}
            </th>
            <th className="text-left px-4 py-2 text-[10px] text-warm-gray uppercase tracking-wider font-medium">ID</th>
          </tr>
        </thead>
        <tbody>
          {paginated.map((m) => (
            <tr key={m.id} className="border-b border-warm-border/30 last:border-0">
              <td className="px-4 py-2 text-xs text-ink">
                {m.external_resource_name || m.external_resource_id}
              </td>
              <td className="px-4 py-2 text-xs text-warm-gray">
                {scope === 'org'
                  ? (m.organizations?.name || '—')
                  : (m.locations?.name || '—')
                }
              </td>
              <td className="px-4 py-2 text-[10px] text-warm-gray font-mono truncate max-w-[200px]">
                {m.external_resource_id}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-warm-border/50">
          <span className="text-[10px] text-warm-gray">
            {page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, mappings.length)} of {mappings.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2.5 py-1 text-[10px] text-warm-gray hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Prev
            </button>
            <span className="text-[10px] text-warm-gray">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-2.5 py-1 text-[10px] text-warm-gray hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
