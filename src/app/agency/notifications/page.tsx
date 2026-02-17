'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { NotificationAlertType } from '@/lib/types'

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
  const [search, setSearch] = useState('')
  const [toggling, setToggling] = useState<string | null>(null)

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

  const filteredOrgs = orgs.filter(org =>
    !search || org.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleToggle = async (orgId: string, alertType: NotificationAlertType, currentlyOn: boolean) => {
    const key = `${orgId}:${alertType}`
    setToggling(key)

    const res = await fetch('/api/notifications/subscriptions/bulk', {
      method: currentlyOn ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_ids: [orgId],
        alert_types: [alertType],
        subscriber_type: 'all_members',
      }),
    })

    if (res.ok) {
      await loadData()
    }
    setToggling(null)
  }

  const totalOrgs = orgs.length
  const fullyConfigured = orgs.filter(o => ALERT_TYPES.every(at => o.configuredAlerts.includes(at.key))).length

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
          {fullyConfigured} of {totalOrgs} orgs fully configured
        </p>
      </div>

      {error && (
        <div className="p-3 border border-red-200 bg-red-50 rounded-lg text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
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

      {/* Org Table with ON/OFF toggles */}
      <div className="border border-warm-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-warm-border bg-cream">
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
              <tr key={org.id} className="hover:bg-warm-light/30 transition-colors">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/${org.slug}/notifications`}
                    className="text-ink font-medium hover:underline underline-offset-2 no-underline"
                  >
                    {org.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="text-warm-gray tabular-nums">{org.locationCount}</span>
                </td>
                {ALERT_TYPES.map(at => {
                  const isOn = (org.alertCounts[at.key] || 0) > 0
                  const toggleKey = `${org.id}:${at.key}`
                  const isToggling = toggling === toggleKey

                  return (
                    <td key={at.key} className="px-3 py-3 text-center">
                      <button
                        onClick={() => handleToggle(org.id, at.key, isOn)}
                        disabled={isToggling}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          isToggling ? 'opacity-50 cursor-wait' : 'cursor-pointer'
                        } ${isOn ? 'bg-emerald-500' : 'bg-warm-border'}`}
                        title={isOn ? 'Click to disable' : 'Click to enable'}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                            isOn ? 'translate-x-[18px]' : 'translate-x-[3px]'
                          }`}
                        />
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
            {filteredOrgs.length === 0 && (
              <tr>
                <td colSpan={2 + ALERT_TYPES.length} className="px-4 py-8 text-center text-warm-gray">
                  {search ? 'No organizations match your search.' : 'No organizations found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
