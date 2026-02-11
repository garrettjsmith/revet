'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { NotificationAlertType, NotificationSubscription } from '@/lib/types'

const ALERT_TYPES: { key: NotificationAlertType; label: string; shortLabel: string; description: string }[] = [
  { key: 'new_review', label: 'New Reviews', shortLabel: 'New', description: 'Any new review comes in' },
  { key: 'negative_review', label: 'Negative Reviews', shortLabel: 'Negative', description: 'Review at or below threshold' },
  { key: 'review_response', label: 'Review Responses', shortLabel: 'Responses', description: 'Reply posted to a review' },
  { key: 'report', label: 'Reports', shortLabel: 'Reports', description: 'Periodic report available' },
]

interface OrgRow {
  id: string
  name: string
  slug: string
  locationCount: number
  configuredAlerts: string[]
  alertCounts: Record<string, number>
}

export default function AgencyNotificationsPage() {
  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Search & filter
  const [search, setSearch] = useState('')
  const [filterGaps, setFilterGaps] = useState(false)

  // Selection state
  const [selectedOrgIds, setSelectedOrgIds] = useState<Set<string>>(new Set())

  // Bulk action state
  const [bulkAlertTypes, setBulkAlertTypes] = useState<Set<NotificationAlertType>>(new Set())
  const [bulkSubscriberType, setBulkSubscriberType] = useState<'all_members' | 'email'>('all_members')
  const [bulkEmail, setBulkEmail] = useState('')
  const [applying, setApplying] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Cell popover state
  const [popover, setPopover] = useState<{ orgId: string; orgSlug: string; alertType: NotificationAlertType; rect: DOMRect } | null>(null)
  const [popoverSubs, setPopoverSubs] = useState<NotificationSubscription[]>([])
  const [popoverLoading, setPopoverLoading] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  const loadData = useCallback(async () => {
    const res = await fetch('/api/notifications/subscriptions/bulk')
    if (res.ok) {
      const data = await res.json()
      setOrgs(data.orgs || [])
    } else {
      setError('Failed to load organizations')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Close popover on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopover(null)
      }
    }
    if (popover) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [popover])

  // Filter orgs
  const filteredOrgs = orgs.filter(org => {
    if (search && !org.name.toLowerCase().includes(search.toLowerCase())) return false
    if (filterGaps && org.configuredAlerts.length === ALERT_TYPES.length) return false
    return true
  })

  const allSelected = filteredOrgs.length > 0 && filteredOrgs.every(o => selectedOrgIds.has(o.id))
  const someSelected = selectedOrgIds.size > 0

  const toggleAll = () => {
    if (allSelected) {
      setSelectedOrgIds(new Set())
    } else {
      setSelectedOrgIds(new Set(filteredOrgs.map(o => o.id)))
    }
  }

  const toggleOrg = (orgId: string) => {
    const next = new Set(selectedOrgIds)
    if (next.has(orgId)) {
      next.delete(orgId)
    } else {
      next.add(orgId)
    }
    setSelectedOrgIds(next)
  }

  const toggleAlertType = (type: NotificationAlertType) => {
    const next = new Set(bulkAlertTypes)
    if (next.has(type)) {
      next.delete(type)
    } else {
      next.add(type)
    }
    setBulkAlertTypes(next)
  }

  const handleBulkAction = async (mode: 'apply' | 'remove') => {
    if (selectedOrgIds.size === 0 || bulkAlertTypes.size === 0) return
    if (mode === 'apply' && bulkSubscriberType === 'email' && (!bulkEmail || !bulkEmail.includes('@'))) {
      setActionResult({ type: 'error', message: 'Enter a valid email address' })
      return
    }

    const isApply = mode === 'apply'
    if (isApply) setApplying(true)
    else setRemoving(true)
    setActionResult(null)

    const res = await fetch('/api/notifications/subscriptions/bulk', {
      method: isApply ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_ids: Array.from(selectedOrgIds),
        alert_types: Array.from(bulkAlertTypes),
        subscriber_type: bulkSubscriberType,
        subscriber_value: bulkSubscriberType === 'email' ? bulkEmail.trim() : undefined,
      }),
    })

    if (res.ok) {
      setActionResult({
        type: 'success',
        message: isApply
          ? `Applied ${bulkAlertTypes.size} alert type(s) across ${selectedOrgIds.size} org(s).`
          : `Removed ${bulkAlertTypes.size} alert type(s) from ${selectedOrgIds.size} org(s).`,
      })
      await loadData()
    } else {
      const data = await res.json()
      setActionResult({ type: 'error', message: data.error || 'Failed' })
    }
    setApplying(false)
    setRemoving(false)
  }

  const handleCellClick = async (orgId: string, orgSlug: string, alertType: NotificationAlertType, e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setPopover({ orgId, orgSlug, alertType, rect })
    setPopoverSubs([])
    setPopoverLoading(true)

    const res = await fetch(`/api/notifications/subscriptions?org_id=${orgId}`)
    if (res.ok) {
      const data = await res.json()
      setPopoverSubs((data.subscriptions || []).filter((s: NotificationSubscription) => s.alert_type === alertType))
    }
    setPopoverLoading(false)
  }

  // Summary stats
  const totalOrgs = orgs.length
  const fullyConfiguredOrgs = orgs.filter(o => ALERT_TYPES.every(at => o.configuredAlerts.includes(at.key))).length
  const orgsNeedingAttention = totalOrgs - fullyConfiguredOrgs

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-warm-gray text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-serif text-ink">Notifications</h1>
        <p className="text-sm text-warm-gray mt-1">
          Manage email alert subscriptions across all organizations.
        </p>
      </div>

      {error && (
        <div className="p-3 border border-red-200 bg-red-50 rounded-lg text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Summary bar */}
      {totalOrgs > 0 && (
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-50 text-green-700 text-xs font-medium tabular-nums">
              {fullyConfiguredOrgs}
            </span>
            <span className="text-warm-gray">
              of {totalOrgs} orgs fully configured
            </span>
          </div>
          {orgsNeedingAttention > 0 && (
            <button
              onClick={() => setFilterGaps(!filterGaps)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filterGaps
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-cream text-warm-gray border-warm-border hover:border-amber-300 hover:text-amber-700'
              }`}
            >
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold tabular-nums">
                {orgsNeedingAttention}
              </span>
              {filterGaps ? 'Showing gaps only' : 'need attention'}
            </button>
          )}
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search organizations..."
            className="w-full pl-8 pr-3 py-2 bg-cream border border-warm-border rounded-lg text-sm text-ink outline-none focus:ring-1 focus:ring-warm-gray placeholder:text-warm-gray/50"
          />
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-warm-gray" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </div>
      </div>

      {/* Org Table */}
      <div className="border border-warm-border rounded-xl overflow-hidden relative">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-warm-border bg-cream">
              <th className="px-4 py-3 text-left w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="accent-ink"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-warm-gray uppercase tracking-wider">Organization</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-warm-gray uppercase tracking-wider">Locations</th>
              {ALERT_TYPES.map(at => (
                <th key={at.key} className="px-3 py-3 text-center text-xs font-medium text-warm-gray uppercase tracking-wider" title={at.description}>
                  {at.shortLabel}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-border/50">
            {filteredOrgs.map(org => (
              <tr
                key={org.id}
                className={`transition-colors ${
                  selectedOrgIds.has(org.id) ? 'bg-warm-light/50' : 'hover:bg-warm-light/30'
                }`}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedOrgIds.has(org.id)}
                    onChange={() => toggleOrg(org.id)}
                    className="accent-ink"
                  />
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/${org.slug}/notifications`}
                    className="text-ink font-medium hover:underline underline-offset-2 no-underline"
                  >
                    {org.name}
                  </Link>
                  <div className="text-[11px] text-warm-gray font-mono">{org.slug}</div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="text-warm-gray tabular-nums">{org.locationCount}</span>
                </td>
                {ALERT_TYPES.map(at => {
                  const count = org.alertCounts[at.key] || 0
                  return (
                    <td key={at.key} className="px-3 py-3 text-center">
                      <button
                        onClick={(e) => handleCellClick(org.id, org.slug, at.key, e)}
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-xs font-medium tabular-nums transition-colors ${
                          count > 0
                            ? 'bg-green-50 text-green-700 hover:bg-green-100'
                            : 'bg-warm-light/50 text-warm-gray/40 hover:bg-warm-light hover:text-warm-gray'
                        }`}
                        title={count > 0 ? `${count} subscriber(s) — click to view` : `No subscribers — click to manage`}
                      >
                        {count > 0 ? count : '\u2013'}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
            {filteredOrgs.length === 0 && (
              <tr>
                <td colSpan={3 + ALERT_TYPES.length} className="px-4 py-8 text-center text-warm-gray">
                  {search || filterGaps ? 'No organizations match your filters.' : 'No organizations found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Cell popover */}
        {popover && (
          <div
            ref={popoverRef}
            className="fixed z-50 bg-white border border-warm-border rounded-xl shadow-lg w-72"
            style={{
              top: Math.min(popover.rect.bottom + 6, window.innerHeight - 300),
              left: Math.max(8, Math.min(popover.rect.left - 100, window.innerWidth - 288)),
            }}
          >
            <div className="px-4 py-3 border-b border-warm-border/50 flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-ink">
                  {ALERT_TYPES.find(at => at.key === popover.alertType)?.label}
                </div>
                <div className="text-[11px] text-warm-gray mt-0.5">
                  {orgs.find(o => o.id === popover.orgId)?.name}
                </div>
              </div>
              <button
                onClick={() => setPopover(null)}
                className="text-warm-gray hover:text-ink text-xs transition-colors"
              >
                Close
              </button>
            </div>

            <div className="px-4 py-3">
              {popoverLoading ? (
                <div className="text-xs text-warm-gray py-2">Loading...</div>
              ) : popoverSubs.length === 0 ? (
                <div className="text-xs text-warm-gray py-2">No subscribers configured for this alert type.</div>
              ) : (
                <div className="space-y-2">
                  {popoverSubs.map(sub => (
                    <div key={sub.id} className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs text-ink truncate">
                          {sub.subscriber_display || (sub.subscriber_type === 'all_members' ? 'All org members' : sub.subscriber_value)}
                        </div>
                        <div className="text-[10px] text-warm-gray">
                          {sub.location_id ? sub.location_name || 'Specific location' : 'All locations'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-warm-border/50">
              <Link
                href={`/admin/${popover.orgSlug}/notifications`}
                className="text-xs text-warm-gray hover:text-ink transition-colors no-underline"
                onClick={() => setPopover(null)}
              >
                Manage in org settings &rarr;
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Floating bulk action bar — only appears when orgs are selected */}
      {someSelected && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-ink text-cream rounded-2xl shadow-xl border border-ink/80 px-5 py-4 w-[calc(100%-3rem)] max-w-2xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">
              {selectedOrgIds.size} org{selectedOrgIds.size !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={() => { setSelectedOrgIds(new Set()); setActionResult(null) }}
              className="text-xs text-cream/60 hover:text-cream transition-colors"
            >
              Clear selection
            </button>
          </div>

          {/* Alert type pills */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {ALERT_TYPES.map(at => (
              <button
                key={at.key}
                onClick={() => toggleAlertType(at.key)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  bulkAlertTypes.has(at.key)
                    ? 'bg-cream text-ink border-cream'
                    : 'bg-transparent text-cream/60 border-cream/20 hover:border-cream/50 hover:text-cream'
                }`}
              >
                {at.label}
              </button>
            ))}
          </div>

          {/* Subscriber config */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select
              value={bulkSubscriberType}
              onChange={e => setBulkSubscriberType(e.target.value as 'all_members' | 'email')}
              className="bg-cream/10 text-cream text-xs border border-cream/20 rounded-lg px-2.5 py-1.5 outline-none"
            >
              <option value="all_members">All org members</option>
              <option value="email">Specific email</option>
            </select>
            {bulkSubscriberType === 'email' && (
              <input
                type="email"
                value={bulkEmail}
                onChange={e => setBulkEmail(e.target.value)}
                placeholder="email@example.com"
                className="bg-cream/10 text-cream text-xs border border-cream/20 rounded-lg px-2.5 py-1.5 outline-none placeholder:text-cream/30 min-w-[180px]"
              />
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBulkAction('apply')}
              disabled={bulkAlertTypes.size === 0 || applying || removing}
              className="px-4 py-1.5 bg-cream hover:bg-cream/90 text-ink text-xs font-medium rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {applying ? 'Applying...' : 'Enable alerts'}
            </button>
            <button
              onClick={() => handleBulkAction('remove')}
              disabled={bulkAlertTypes.size === 0 || applying || removing}
              className="px-4 py-1.5 border border-cream/30 hover:border-cream/60 text-cream/70 hover:text-cream text-xs font-medium rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {removing ? 'Removing...' : 'Remove alerts'}
            </button>
          </div>

          {actionResult && (
            <div className={`mt-2 text-xs px-3 py-1.5 rounded-lg ${
              actionResult.type === 'success'
                ? 'bg-green-900/30 text-green-300'
                : 'bg-red-900/30 text-red-300'
            }`}>
              {actionResult.message}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
