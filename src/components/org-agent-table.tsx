'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type TrustLevel = 'auto' | 'queue' | 'off'

interface LocationAgent {
  location_id: string
  location_name: string
  city: string | null
  state: string | null
  service_tier: string
  enabled: boolean
  review_replies: TrustLevel
  profile_updates: TrustLevel
  post_publishing: TrustLevel
  auto_reply_min_rating: number
  auto_reply_max_rating: number
  escalate_below_rating: number
  audit_score: number | null
  last_run: string | null
  has_config: boolean
}

const TRUST_OPTIONS: { value: TrustLevel; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'queue', label: 'Queue' },
  { value: 'off', label: 'Off' },
]

function TrustPill({
  value,
  onChange,
}: {
  value: TrustLevel
  onChange: (v: TrustLevel) => void
}) {
  return (
    <div className="flex gap-0.5">
      {TRUST_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
            value === opt.value
              ? 'bg-ink text-cream border-ink'
              : 'bg-white text-warm-gray border-warm-border hover:border-ink hover:text-ink'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
        checked ? 'bg-emerald-500' : 'bg-warm-gray/30'
      }`}
    >
      <span
        className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-3.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export function OrgAgentTable({
  orgId,
  orgSlug,
  locations,
}: {
  orgId: string
  orgSlug: string
  locations: LocationAgent[]
}) {
  const router = useRouter()
  const [rows, setRows] = useState<LocationAgent[]>(locations)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState<Set<string>>(new Set())

  const allSelected = selected.size === rows.length && rows.length > 0

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(rows.map((r) => r.location_id)))
    }
  }

  const toggleOne = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const updateRow = (locationId: string, field: string, value: unknown) => {
    setRows((prev) =>
      prev.map((r) =>
        r.location_id === locationId ? { ...r, [field]: value } : r
      )
    )
    setDirty((prev) => new Set(prev).add(locationId))
  }

  const handleSave = async () => {
    if (dirty.size === 0) return
    setSaving(true)
    try {
      const dirtyRows = rows.filter((r) => dirty.has(r.location_id))
      // Group by identical config to minimize requests
      for (const row of dirtyRows) {
        await fetch(`/api/locations/${row.location_id}/agent`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location_id: row.location_id,
            enabled: row.enabled,
            review_replies: row.review_replies,
            profile_updates: row.profile_updates,
            post_publishing: row.post_publishing,
            auto_reply_min_rating: row.auto_reply_min_rating,
            auto_reply_max_rating: row.auto_reply_max_rating,
            escalate_below_rating: row.escalate_below_rating,
          }),
        })
      }
      setDirty(new Set())
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  const handleBulkPatch = async (patch: Record<string, unknown>) => {
    if (selected.size === 0) return
    setSaving(true)
    try {
      const ids = Array.from(selected)
      await fetch(`/api/orgs/${orgId}/agent`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_ids: ids, patch }),
      })
      // Update local state
      setRows((prev) =>
        prev.map((r) =>
          selected.has(r.location_id) ? { ...r, ...patch } : r
        )
      )
      setSelected(new Set())
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  const enabledCount = rows.filter((r) => r.enabled).length

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Locations</div>
          <div className="text-2xl font-bold font-mono text-cream">{rows.length}</div>
        </div>
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Agent Enabled</div>
          <div className="text-2xl font-bold font-mono text-cream">{enabledCount}</div>
        </div>
        <div className="bg-ink rounded-xl p-5">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Avg Score</div>
          <div className="text-2xl font-bold font-mono text-cream">
            {(() => {
              const scores = rows.map((r) => r.audit_score).filter((s): s is number => s !== null)
              return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : '---'
            })()}
          </div>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-ink/5 border border-warm-border rounded-xl">
          <span className="text-xs text-ink font-medium">{selected.size} selected</span>
          <div className="h-4 border-l border-warm-border" />
          <button
            onClick={() => handleBulkPatch({ enabled: true })}
            disabled={saving}
            className="px-3 py-1 text-xs rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors disabled:opacity-50"
          >
            Enable All
          </button>
          <button
            onClick={() => handleBulkPatch({ enabled: false })}
            disabled={saving}
            className="px-3 py-1 text-xs rounded-full bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            Disable All
          </button>
          <div className="h-4 border-l border-warm-border" />
          <span className="text-[10px] text-warm-gray">Set trust:</span>
          {(['review_replies', 'profile_updates', 'post_publishing'] as const).map((field) => (
            <div key={field} className="flex items-center gap-1">
              <span className="text-[10px] text-warm-gray capitalize">
                {field === 'review_replies' ? 'Reviews' : field === 'profile_updates' ? 'Profile' : 'Posts'}
              </span>
              <select
                onChange={(e) => {
                  if (e.target.value) handleBulkPatch({ [field]: e.target.value })
                  e.target.value = ''
                }}
                className="text-[10px] border border-warm-border rounded px-1 py-0.5 bg-white text-ink"
                defaultValue=""
              >
                <option value="" disabled>--</option>
                <option value="auto">Auto</option>
                <option value="queue">Queue</option>
                <option value="off">Off</option>
              </select>
            </div>
          ))}
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-warm-gray hover:text-ink transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="border border-warm-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-warm-border bg-warm-light/30">
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded border-warm-border"
                />
              </th>
              <th className="text-left px-3 py-3 text-xs font-medium text-ink uppercase tracking-wider">Location</th>
              <th className="text-center px-3 py-3 text-xs font-medium text-ink uppercase tracking-wider">Agent</th>
              <th className="text-center px-3 py-3 text-xs font-medium text-ink uppercase tracking-wider">Reviews</th>
              <th className="text-center px-3 py-3 text-xs font-medium text-ink uppercase tracking-wider">Profile</th>
              <th className="text-center px-3 py-3 text-xs font-medium text-ink uppercase tracking-wider">Posts</th>
              <th className="text-center px-3 py-3 text-xs font-medium text-ink uppercase tracking-wider">Score</th>
              <th className="text-right px-3 py-3 text-xs font-medium text-ink uppercase tracking-wider">Last Run</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-border/50">
            {rows.map((row) => (
              <tr
                key={row.location_id}
                className={`transition-colors ${
                  dirty.has(row.location_id) ? 'bg-amber-50/50' : 'hover:bg-warm-light/30'
                }`}
              >
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(row.location_id)}
                    onChange={() => toggleOne(row.location_id)}
                    className="rounded border-warm-border"
                  />
                </td>
                <td className="px-3 py-3">
                  <Link
                    href={`/admin/${orgSlug}/locations/${row.location_id}/agent`}
                    className="text-sm font-medium text-ink hover:underline no-underline"
                  >
                    {row.location_name}
                  </Link>
                  {(row.city || row.state) && (
                    <div className="text-[10px] text-warm-gray mt-0.5">
                      {[row.city, row.state].filter(Boolean).join(', ')}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 text-center">
                  <ToggleSwitch
                    checked={row.enabled}
                    onChange={(v) => updateRow(row.location_id, 'enabled', v)}
                  />
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-center">
                    <TrustPill
                      value={row.review_replies}
                      onChange={(v) => updateRow(row.location_id, 'review_replies', v)}
                    />
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-center">
                    <TrustPill
                      value={row.profile_updates}
                      onChange={(v) => updateRow(row.location_id, 'profile_updates', v)}
                    />
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-center">
                    <TrustPill
                      value={row.post_publishing}
                      onChange={(v) => updateRow(row.location_id, 'post_publishing', v)}
                    />
                  </div>
                </td>
                <td className="px-3 py-3 text-center">
                  {row.audit_score !== null ? (
                    <span className={`text-sm font-mono font-medium ${
                      row.audit_score >= 80 ? 'text-emerald-600' :
                      row.audit_score >= 50 ? 'text-amber-600' :
                      'text-red-600'
                    }`}>
                      {row.audit_score}
                    </span>
                  ) : (
                    <span className="text-xs text-warm-gray">---</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  {row.last_run ? (
                    <span className="text-xs text-warm-gray">
                      {formatRelativeTime(row.last_run)}
                    </span>
                  ) : (
                    <span className="text-xs text-warm-gray">Never</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-sm text-warm-gray">
                  No locations found for this organization.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Save bar */}
      {dirty.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <span className="text-xs text-amber-700">
            {dirty.size} location{dirty.size !== 1 ? 's' : ''} modified
          </span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-1.5 bg-ink text-cream text-xs rounded-full hover:bg-ink/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={() => {
              setRows(locations)
              setDirty(new Set())
            }}
            className="text-xs text-warm-gray hover:text-ink transition-colors"
          >
            Discard
          </button>
        </div>
      )}
    </div>
  )
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
