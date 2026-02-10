'use client'

import { useState, useEffect, useCallback } from 'react'
import type { NotificationAlertType } from '@/lib/types'

const ALERT_TYPES: { key: NotificationAlertType; label: string; description: string }[] = [
  { key: 'new_review', label: 'New Reviews', description: 'Any new review comes in' },
  { key: 'negative_review', label: 'Negative Reviews', description: 'Review at or below threshold' },
  { key: 'review_response', label: 'Review Responses', description: 'Reply posted to a review' },
  { key: 'report', label: 'Reports', description: 'Periodic report available' },
]

interface OrgRow {
  id: string
  name: string
  slug: string
  locationCount: number
  configuredAlerts: string[]
}

export default function AgencyNotificationsPage() {
  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Selection state
  const [selectedOrgIds, setSelectedOrgIds] = useState<Set<string>>(new Set())

  // Bulk action state
  const [bulkAlertTypes, setBulkAlertTypes] = useState<Set<NotificationAlertType>>(new Set())
  const [bulkSubscriberType, setBulkSubscriberType] = useState<'all_members' | 'email'>('all_members')
  const [bulkEmail, setBulkEmail] = useState('')
  const [applying, setApplying] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

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

  const allSelected = orgs.length > 0 && selectedOrgIds.size === orgs.length
  const someSelected = selectedOrgIds.size > 0

  const toggleAll = () => {
    if (allSelected) {
      setSelectedOrgIds(new Set())
    } else {
      setSelectedOrgIds(new Set(orgs.map(o => o.id)))
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

  const handleApply = async () => {
    if (selectedOrgIds.size === 0 || bulkAlertTypes.size === 0) return
    if (bulkSubscriberType === 'email' && (!bulkEmail || !bulkEmail.includes('@'))) {
      setActionResult({ type: 'error', message: 'Enter a valid email address' })
      return
    }

    setApplying(true)
    setActionResult(null)

    const res = await fetch('/api/notifications/subscriptions/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_ids: Array.from(selectedOrgIds),
        alert_types: Array.from(bulkAlertTypes),
        subscriber_type: bulkSubscriberType,
        subscriber_value: bulkSubscriberType === 'email' ? bulkEmail.trim() : undefined,
      }),
    })

    if (res.ok) {
      const data = await res.json()
      setActionResult({
        type: 'success',
        message: `Applied ${Array.from(bulkAlertTypes).length} alert type(s) across ${selectedOrgIds.size} org(s).`,
      })
      await loadData()
    } else {
      const data = await res.json()
      setActionResult({ type: 'error', message: data.error || 'Failed to apply' })
    }
    setApplying(false)
  }

  const handleRemove = async () => {
    if (selectedOrgIds.size === 0 || bulkAlertTypes.size === 0) return

    setRemoving(true)
    setActionResult(null)

    const res = await fetch('/api/notifications/subscriptions/bulk', {
      method: 'DELETE',
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
        message: `Removed ${Array.from(bulkAlertTypes).length} alert type(s) from ${selectedOrgIds.size} org(s).`,
      })
      await loadData()
    } else {
      const data = await res.json()
      setActionResult({ type: 'error', message: data.error || 'Failed to remove' })
    }
    setRemoving(false)
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-warm-gray text-sm">Loading...</div>
      </div>
    )
  }

  const selectedLocationCount = orgs
    .filter(o => selectedOrgIds.has(o.id))
    .reduce((sum, o) => sum + o.locationCount, 0)

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-serif text-ink">Bulk Notifications</h1>
        <p className="text-sm text-warm-gray mt-1">
          Configure email alert subscriptions across all organizations at once.
        </p>
      </div>

      {error && (
        <div className="p-3 border border-red-200 bg-red-50 rounded-lg text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Bulk Action Panel */}
      <div className="border border-warm-border rounded-xl bg-cream">
        <div className="px-5 py-4 border-b border-warm-border/50">
          <div className="text-sm text-ink font-medium">Apply to selected organizations</div>
          <div className="text-xs text-warm-gray mt-0.5">
            {someSelected
              ? `${selectedOrgIds.size} org(s) selected (${selectedLocationCount} locations)`
              : 'Select organizations below, then choose alert types to apply'}
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Alert type checkboxes */}
          <div>
            <div className="text-xs font-medium text-warm-gray uppercase tracking-wider mb-2">Alert Types</div>
            <div className="flex flex-wrap gap-2">
              {ALERT_TYPES.map(at => (
                <button
                  key={at.key}
                  onClick={() => toggleAlertType(at.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    bulkAlertTypes.has(at.key)
                      ? 'bg-ink text-cream border-ink'
                      : 'bg-cream text-warm-gray border-warm-border hover:border-ink hover:text-ink'
                  }`}
                  title={at.description}
                >
                  {at.label}
                </button>
              ))}
            </div>
          </div>

          {/* Subscriber type */}
          <div>
            <div className="text-xs font-medium text-warm-gray uppercase tracking-wider mb-2">Who Gets Notified</div>
            <div className="flex flex-wrap gap-3 items-center">
              <label className="flex items-center gap-1.5 text-sm text-ink cursor-pointer">
                <input
                  type="radio"
                  name="subscriberType"
                  checked={bulkSubscriberType === 'all_members'}
                  onChange={() => setBulkSubscriberType('all_members')}
                  className="accent-ink"
                />
                All org members
              </label>
              <label className="flex items-center gap-1.5 text-sm text-ink cursor-pointer">
                <input
                  type="radio"
                  name="subscriberType"
                  checked={bulkSubscriberType === 'email'}
                  onChange={() => setBulkSubscriberType('email')}
                  className="accent-ink"
                />
                Specific email
              </label>
              {bulkSubscriberType === 'email' && (
                <input
                  type="email"
                  value={bulkEmail}
                  onChange={e => setBulkEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="px-3 py-1.5 bg-white border border-warm-border rounded-lg text-sm text-ink outline-none focus:ring-1 focus:ring-warm-gray placeholder:text-warm-gray/50"
                />
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleApply}
              disabled={!someSelected || bulkAlertTypes.size === 0 || applying || removing}
              className="px-5 py-2 bg-ink hover:bg-ink/90 text-cream text-sm font-medium rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {applying ? 'Applying...' : 'Apply to Selected'}
            </button>
            <button
              onClick={handleRemove}
              disabled={!someSelected || bulkAlertTypes.size === 0 || applying || removing}
              className="px-5 py-2 border border-warm-border hover:border-ink text-warm-gray hover:text-ink text-sm font-medium rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {removing ? 'Removing...' : 'Remove from Selected'}
            </button>
          </div>

          {actionResult && (
            <div className={`text-xs px-3 py-2 rounded-lg ${
              actionResult.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {actionResult.message}
            </div>
          )}
        </div>
      </div>

      {/* Org Table */}
      <div className="border border-warm-border rounded-xl overflow-hidden">
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
                <th key={at.key} className="px-3 py-3 text-center text-xs font-medium text-warm-gray uppercase tracking-wider">
                  {at.label.replace(' ', '\n').split(' ')[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-border/50">
            {orgs.map(org => (
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
                  <div className="text-ink font-medium">{org.name}</div>
                  <div className="text-[11px] text-warm-gray font-mono">{org.slug}</div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="text-warm-gray tabular-nums">{org.locationCount}</span>
                </td>
                {ALERT_TYPES.map(at => {
                  const configured = org.configuredAlerts.includes(at.key)
                  return (
                    <td key={at.key} className="px-3 py-3 text-center">
                      {configured ? (
                        <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Configured" />
                      ) : (
                        <span className="inline-block w-2 h-2 rounded-full bg-warm-border" title="Not configured" />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
            {orgs.length === 0 && (
              <tr>
                <td colSpan={3 + ALERT_TYPES.length} className="px-4 py-8 text-center text-warm-gray">
                  No organizations found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-warm-gray">
        Green dot = at least one subscription configured for that alert type (org-wide or location-specific).
        Use the per-org notifications page for fine-grained location-specific overrides.
      </div>
    </div>
  )
}
