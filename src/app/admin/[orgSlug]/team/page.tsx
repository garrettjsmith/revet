'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import type { NotificationAlertType, NotificationSubscription } from '@/lib/types'

const ALERT_TYPES: { type: NotificationAlertType; label: string; description: string }[] = [
  { type: 'new_review', label: 'New Reviews', description: 'Any new review arrives' },
  { type: 'negative_review', label: 'Negative Reviews', description: 'Rating at or below threshold' },
  { type: 'review_response', label: 'Responses', description: 'Reply posted to a review' },
  { type: 'report', label: 'Reports', description: 'Periodic report available' },
]

interface TeamMember {
  id: string
  user_id: string
  email: string | null
  role: 'owner' | 'admin' | 'member'
  is_agency_admin: boolean
  location_access: 'all' | 'specific'
  created_at: string
  assigned_location_ids: string[]
}

interface TeamLocation {
  id: string
  name: string
  city: string | null
  state: string | null
}

export default function TeamPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string
  const supabase = createClient()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [subscriptions, setSubscriptions] = useState<NotificationSubscription[]>([])
  const [locations, setLocations] = useState<TeamLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null) // tracks which alert is saving

  const loadTeam = useCallback(async (oid: string) => {
    const res = await fetch(`/api/team?org_id=${oid}`)
    if (res.ok) {
      const data = await res.json()
      setMembers(data.members || [])
      setSubscriptions(data.subscriptions || [])
      setLocations(data.locations || [])
    }
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
      await loadTeam(org.id)
      setLoading(false)
    }
    load()
  }, [orgSlug, supabase, loadTeam])

  // Get org-wide "all_members" subscriptions
  const orgWideAlerts = new Set(
    subscriptions
      .filter(s => s.subscriber_type === 'all_members' && !s.location_id)
      .map(s => s.alert_type)
  )

  // Get a member's personal subscriptions
  const getMemberSubs = (userId: string) =>
    subscriptions.filter(s => s.subscriber_type === 'user' && s.subscriber_value === userId)

  // Check if a member has a specific alert enabled (personal subscription)
  const getMemberAlertSub = (userId: string, alertType: NotificationAlertType) =>
    subscriptions.find(
      s => s.subscriber_type === 'user' && s.subscriber_value === userId && s.alert_type === alertType && !s.location_id
    )

  // Count active alerts for a member (personal + inherited)
  const countActiveAlerts = (userId: string) => {
    let count = orgWideAlerts.size
    const memberSubs = getMemberSubs(userId)
    for (const sub of memberSubs) {
      if (!orgWideAlerts.has(sub.alert_type)) count++
    }
    return count
  }

  // Toggle an alert for a member
  const toggleAlert = async (member: TeamMember, alertType: NotificationAlertType) => {
    if (!orgId) return
    const key = `${member.user_id}-${alertType}`
    setSaving(key)

    const existingSub = getMemberAlertSub(member.user_id, alertType)

    if (existingSub) {
      // Remove it
      await fetch('/api/notifications/subscriptions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: existingSub.id }),
      })
    } else {
      // Add it
      await fetch('/api/notifications/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          alert_type: alertType,
          subscriber_type: 'user',
          subscriber_value: member.user_id,
          location_id: null,
        }),
      })
    }

    await loadTeam(orgId)
    setSaving(null)
  }

  // Enable all alerts for a member
  const enableAllAlerts = async (member: TeamMember) => {
    if (!orgId) return
    setSaving(`${member.user_id}-all`)

    const existingTypes = new Set(getMemberSubs(member.user_id).map(s => s.alert_type))
    const missing = ALERT_TYPES.filter(a => !existingTypes.has(a.type) && !orgWideAlerts.has(a.type))

    for (const alert of missing) {
      await fetch('/api/notifications/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          alert_type: alert.type,
          subscriber_type: 'user',
          subscriber_value: member.user_id,
          location_id: null,
        }),
      })
    }

    await loadTeam(orgId)
    setSaving(null)
  }

  if (loading) {
    return <div className="text-warm-gray text-sm">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif text-ink">Team</h1>
          <p className="text-sm text-warm-gray mt-1">
            Manage members and their notification preferences.
          </p>
        </div>
      </div>

      {/* Org-wide alerts banner */}
      {orgWideAlerts.size > 0 && (
        <div className="bg-warm-light/50 border border-warm-border rounded-xl px-5 py-3">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1.5">Org-wide alerts (all members receive)</div>
          <div className="flex flex-wrap gap-1.5">
            {ALERT_TYPES.filter(a => orgWideAlerts.has(a.type)).map(alert => (
              <span key={alert.type} className="px-2.5 py-1 bg-cream border border-warm-border rounded-full text-xs text-ink">
                {alert.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Member list */}
      {members.length === 0 ? (
        <div className="border border-warm-border rounded-xl p-8 text-center">
          <p className="text-sm text-warm-gray">No team members found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map(member => {
            const isExpanded = expandedId === member.id
            const activeAlertCount = countActiveAlerts(member.user_id)
            const memberSubs = getMemberSubs(member.user_id)
            const locationLabel = member.location_access === 'all'
              ? 'All locations'
              : `${member.assigned_location_ids.length} location${member.assigned_location_ids.length !== 1 ? 's' : ''}`

            return (
              <div
                key={member.id}
                className="border border-warm-border rounded-xl overflow-hidden transition-all"
              >
                {/* Summary row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : member.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-warm-light/30 transition-colors"
                >
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-ink flex items-center justify-center text-cream text-sm font-bold font-mono shrink-0">
                    {(member.email || member.user_id)[0].toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-ink font-medium truncate">
                      {member.email || `${member.user_id.slice(0, 8)}...`}
                    </div>
                    <div className="text-xs text-warm-gray mt-0.5">
                      {locationLabel}
                      <span className="mx-1.5 text-warm-border">·</span>
                      {activeAlertCount} alert{activeAlertCount !== 1 ? 's' : ''} active
                    </div>
                  </div>

                  {/* Alert dots — quick visual of what's on */}
                  <div className="flex items-center gap-1 shrink-0">
                    {ALERT_TYPES.map(alert => {
                      const hasPersonal = !!getMemberAlertSub(member.user_id, alert.type)
                      const hasInherited = orgWideAlerts.has(alert.type)
                      const isActive = hasPersonal || hasInherited
                      return (
                        <div
                          key={alert.type}
                          className={`w-2 h-2 rounded-full transition-colors ${
                            isActive ? 'bg-ink' : 'bg-warm-border'
                          }`}
                          title={`${alert.label}: ${isActive ? 'ON' : 'OFF'}`}
                        />
                      )
                    })}
                  </div>

                  {/* Role badge */}
                  <span className="pill-dashed text-[11px] shrink-0">
                    {member.role}
                  </span>

                  {/* Expand chevron */}
                  <svg
                    className={`w-4 h-4 text-warm-gray transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-warm-border/50 px-5 py-5 space-y-5 bg-warm-light/20">
                    {/* Access section */}
                    <div>
                      <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-2">Access</div>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="px-2.5 py-1 bg-cream border border-warm-border rounded-full text-xs text-ink">
                          {member.role}
                        </span>
                        <span className="px-2.5 py-1 bg-cream border border-warm-border rounded-full text-xs text-ink">
                          {locationLabel}
                        </span>
                        {member.location_access === 'specific' && member.assigned_location_ids.length > 0 && (
                          member.assigned_location_ids.map(locId => {
                            const loc = locations.find(l => l.id === locId)
                            return loc ? (
                              <span key={locId} className="px-2.5 py-1 bg-cream border border-warm-border/50 rounded-full text-[11px] text-warm-gray">
                                {loc.name}
                              </span>
                            ) : null
                          })
                        )}
                      </div>
                    </div>

                    {/* Alerts section */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-[11px] text-warm-gray uppercase tracking-wider">Alerts</div>
                        {activeAlertCount < ALERT_TYPES.length && (
                          <button
                            onClick={() => enableAllAlerts(member)}
                            disabled={saving === `${member.user_id}-all`}
                            className="text-[11px] text-warm-gray hover:text-ink transition-colors disabled:opacity-50"
                          >
                            {saving === `${member.user_id}-all` ? 'Enabling...' : 'Enable all'}
                          </button>
                        )}
                      </div>

                      <div className="space-y-1">
                        {ALERT_TYPES.map(alert => {
                          const hasPersonal = !!getMemberAlertSub(member.user_id, alert.type)
                          const hasInherited = orgWideAlerts.has(alert.type)
                          const isActive = hasPersonal || hasInherited
                          const isSaving = saving === `${member.user_id}-${alert.type}`

                          return (
                            <div
                              key={alert.type}
                              className="flex items-center justify-between py-2.5 px-3.5 rounded-lg hover:bg-cream/50 transition-colors"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-sm text-ink">{alert.label}</div>
                                <div className="text-[11px] text-warm-gray mt-0.5">
                                  {alert.description}
                                  {hasInherited && !hasPersonal && (
                                    <span className="ml-1.5 text-warm-gray/60">
                                      (org-wide)
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Toggle switch */}
                              <button
                                onClick={() => toggleAlert(member, alert.type)}
                                disabled={isSaving || (hasInherited && !hasPersonal)}
                                className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ml-3 ${
                                  hasInherited && !hasPersonal
                                    ? 'bg-warm-gray/30 cursor-not-allowed'
                                    : ''
                                } ${
                                  isSaving ? 'opacity-50' : ''
                                }`}
                                title={
                                  hasInherited && !hasPersonal
                                    ? 'Enabled org-wide. Manage in Notification Settings.'
                                    : isActive
                                    ? 'Click to disable'
                                    : 'Click to enable'
                                }
                                aria-label={`${alert.label}: ${isActive ? 'on' : 'off'}`}
                              >
                                <span
                                  className={`block w-10 h-6 rounded-full transition-colors ${
                                    isActive ? 'bg-ink' : 'bg-warm-border'
                                  }`}
                                />
                                <span
                                  className={`absolute top-1 w-4 h-4 rounded-full bg-cream shadow-sm transition-transform ${
                                    isActive ? 'translate-x-5' : 'translate-x-1'
                                  }`}
                                />
                              </button>
                            </div>
                          )
                        })}
                      </div>

                      {/* Location-specific subscriptions */}
                      {memberSubs.filter(s => s.location_id).length > 0 && (
                        <div className="mt-3 pt-3 border-t border-warm-border/30">
                          <div className="text-[11px] text-warm-gray mb-1.5">Location-specific alerts</div>
                          <div className="space-y-1">
                            {memberSubs.filter(s => s.location_id).map(sub => {
                              const loc = locations.find(l => l.id === sub.location_id)
                              return (
                                <div key={sub.id} className="flex items-center justify-between py-1.5 px-3.5 text-xs text-warm-gray">
                                  <span>
                                    {ALERT_TYPES.find(a => a.type === sub.alert_type)?.label || sub.alert_type}
                                    <span className="mx-1 text-warm-border">·</span>
                                    {loc?.name || 'Unknown location'}
                                  </span>
                                  <button
                                    onClick={async () => {
                                      setSaving(sub.id)
                                      await fetch('/api/notifications/subscriptions', {
                                        method: 'DELETE',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ id: sub.id }),
                                      })
                                      if (orgId) await loadTeam(orgId)
                                      setSaving(null)
                                    }}
                                    disabled={saving === sub.id}
                                    className="text-warm-gray hover:text-ink transition-colors disabled:opacity-50"
                                  >
                                    Remove
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Member metadata */}
                    <div className="pt-3 border-t border-warm-border/30 flex items-center justify-between">
                      <span className="text-[11px] text-warm-gray">
                        Joined {new Date(member.created_at).toLocaleDateString()}
                      </span>
                      <span className="text-[11px] text-warm-gray font-mono">
                        {member.user_id.slice(0, 8)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
