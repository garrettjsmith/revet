'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import type { NotificationPreference, NotificationAlertType } from '@/lib/types'

const ALERT_TYPE_LABELS: Record<NotificationAlertType, string> = {
  new_review: 'New Reviews',
  negative_review: 'Negative Reviews',
  review_response: 'Review Responses',
  report: 'Reports',
}

const ALERT_TYPE_DESCRIPTIONS: Record<NotificationAlertType, string> = {
  new_review: 'Any new review comes in',
  negative_review: 'Rating at or below threshold',
  review_response: 'A reply is posted to a review',
  report: 'Periodic report is available',
}

const ALERT_TYPES: NotificationAlertType[] = ['new_review', 'negative_review', 'review_response', 'report']

interface LocationPrefs {
  locationId: string
  locationName: string
  prefs: Record<NotificationAlertType, { id: string; email_enabled: boolean }>
}

export default function NotificationsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string
  const supabase = createClient()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [locationPrefs, setLocationPrefs] = useState<LocationPrefs[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [isAgencyAdmin, setIsAgencyAdmin] = useState(false)
  const [initializing, setInitializing] = useState(false)
  const [hasLocations, setHasLocations] = useState(false)

  const loadPreferences = useCallback(async (oid: string) => {
    const res = await fetch(`/api/notifications/preferences?org_id=${oid}`)
    const data = await res.json()
    const prefs: NotificationPreference[] = data.preferences || []

    // Group by location
    const grouped = new Map<string, LocationPrefs>()
    for (const p of prefs) {
      if (!grouped.has(p.location_id)) {
        grouped.set(p.location_id, {
          locationId: p.location_id,
          locationName: p.location_name || p.location_id.slice(0, 8),
          prefs: {} as LocationPrefs['prefs'],
        })
      }
      const loc = grouped.get(p.location_id)!
      loc.prefs[p.alert_type] = { id: p.id, email_enabled: p.email_enabled }
    }

    setLocationPrefs(Array.from(grouped.values()).sort((a, b) => a.locationName.localeCompare(b.locationName)))
  }, [])

  useEffect(() => {
    async function load() {
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .single()

      if (!org) return
      setOrgId(org.id)

      // Check agency admin
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: membership } = await supabase
          .from('org_members')
          .select('is_agency_admin')
          .eq('user_id', user.id)
          .eq('is_agency_admin', true)
          .limit(1)
          .maybeSingle()

        setIsAgencyAdmin(!!membership)
      }

      // Check if org has locations
      const { count } = await supabase
        .from('locations')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org.id)

      setHasLocations((count ?? 0) > 0)

      await loadPreferences(org.id)
      setLoading(false)
    }
    load()
  }, [orgSlug, supabase, loadPreferences])

  const handleToggle = async (prefId: string, currentValue: boolean) => {
    setToggling(prefId)

    // Optimistic update
    setLocationPrefs(prev => prev.map(loc => ({
      ...loc,
      prefs: Object.fromEntries(
        Object.entries(loc.prefs).map(([type, pref]) =>
          pref.id === prefId ? [type, { ...pref, email_enabled: !currentValue }] : [type, pref]
        )
      ) as LocationPrefs['prefs'],
    })))

    const res = await fetch('/api/notifications/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: prefId, email_enabled: !currentValue }),
    })

    if (!res.ok) {
      // Revert on failure
      setLocationPrefs(prev => prev.map(loc => ({
        ...loc,
        prefs: Object.fromEntries(
          Object.entries(loc.prefs).map(([type, pref]) =>
            pref.id === prefId ? [type, { ...pref, email_enabled: currentValue }] : [type, pref]
          )
        ) as LocationPrefs['prefs'],
      })))
    }

    setToggling(null)
  }

  const handleInitialize = async () => {
    if (!orgId) return
    setInitializing(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Get all locations for this org
    const { data: locations } = await supabase
      .from('locations')
      .select('id')
      .eq('org_id', orgId)

    if (!locations || locations.length === 0) {
      setInitializing(false)
      return
    }

    const res = await fetch('/api/notifications/preferences/initialize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: orgId,
        user_id: user.id,
        location_ids: locations.map(l => l.id),
      }),
    })

    if (res.ok) {
      await loadPreferences(orgId)
    }
    setInitializing(false)
  }

  if (loading) {
    return <div className="text-warm-gray text-sm">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif text-ink">Notification Preferences</h1>
        <p className="text-sm text-warm-gray mt-1">
          Control which email alerts you receive for each location.
        </p>
      </div>

      {locationPrefs.length === 0 ? (
        <div className="border border-warm-border rounded-xl p-8 text-center">
          {!hasLocations ? (
            <p className="text-sm text-warm-gray">
              No locations in this organization yet. Add locations first.
            </p>
          ) : (
            <>
              <p className="text-sm text-warm-gray mb-4">
                No notification preferences configured yet.
              </p>
              {isAgencyAdmin && (
                <button
                  onClick={handleInitialize}
                  disabled={initializing}
                  className="px-5 py-2 bg-ink hover:bg-ink/90 text-cream text-sm font-medium rounded-full transition-colors disabled:opacity-50"
                >
                  {initializing ? 'Setting up...' : 'Set Up My Alerts'}
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="border border-warm-border rounded-xl overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-warm-border">
                  <th className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium w-48">
                    Location
                  </th>
                  {ALERT_TYPES.map(type => (
                    <th key={type} className="text-center px-4 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium">
                      <div>{ALERT_TYPE_LABELS[type]}</div>
                      <div className="font-normal normal-case tracking-normal mt-0.5 text-[10px] opacity-70">
                        {ALERT_TYPE_DESCRIPTIONS[type]}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {locationPrefs.map((loc) => (
                  <tr key={loc.locationId} className="border-b border-warm-border/50">
                    <td className="px-5 py-4 text-sm text-ink font-medium">
                      {loc.locationName}
                    </td>
                    {ALERT_TYPES.map(type => {
                      const pref = loc.prefs[type]
                      if (!pref) {
                        return <td key={type} className="text-center px-4 py-4 text-warm-gray text-xs">--</td>
                      }
                      return (
                        <td key={type} className="text-center px-4 py-4">
                          <button
                            onClick={() => handleToggle(pref.id, pref.email_enabled)}
                            disabled={toggling === pref.id}
                            className="inline-flex items-center justify-center"
                            aria-label={`${pref.email_enabled ? 'Disable' : 'Enable'} ${ALERT_TYPE_LABELS[type]} for ${loc.locationName}`}
                          >
                            <div className={`relative w-9 h-5 rounded-full transition-colors ${
                              pref.email_enabled ? 'bg-ink' : 'bg-warm-border'
                            }`}>
                              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-cream transition-transform ${
                                pref.email_enabled ? 'translate-x-4' : 'translate-x-0.5'
                              }`} />
                            </div>
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-warm-border/50">
            {locationPrefs.map((loc) => (
              <div key={loc.locationId} className="p-4">
                <div className="text-sm text-ink font-medium mb-3">{loc.locationName}</div>
                <div className="space-y-2.5">
                  {ALERT_TYPES.map(type => {
                    const pref = loc.prefs[type]
                    if (!pref) return null
                    return (
                      <div key={type} className="flex items-center justify-between">
                        <span className="text-xs text-warm-gray">{ALERT_TYPE_LABELS[type]}</span>
                        <button
                          onClick={() => handleToggle(pref.id, pref.email_enabled)}
                          disabled={toggling === pref.id}
                          className="inline-flex items-center justify-center"
                        >
                          <div className={`relative w-9 h-5 rounded-full transition-colors ${
                            pref.email_enabled ? 'bg-ink' : 'bg-warm-border'
                          }`}>
                            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-cream transition-transform ${
                              pref.email_enabled ? 'translate-x-4' : 'translate-x-0.5'
                            }`} />
                          </div>
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
