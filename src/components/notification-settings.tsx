'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { NotificationSubscription, NotificationAlertType, SubscriberType } from '@/lib/types'

const ALERT_TYPE_LABELS: Record<NotificationAlertType, string> = {
  new_review: 'New Reviews',
  negative_review: 'Negative Reviews',
  review_response: 'Review Responses',
  report: 'Reports',
}

const ALERT_TYPE_DESCRIPTIONS: Record<NotificationAlertType, string> = {
  new_review: 'When any new review comes in',
  negative_review: 'When a review is at or below the rating threshold',
  review_response: 'When a reply is posted to a review',
  report: 'When a periodic report is available',
}

const ALERT_TYPES: NotificationAlertType[] = ['new_review', 'negative_review', 'review_response', 'report']

const SUBSCRIBER_TYPE_LABELS: Record<SubscriberType, string> = {
  all_members: 'All org members',
  user: 'Specific member',
  email: 'Email address',
}

interface OrgLocation {
  id: string
  name: string
}

interface OrgMemberOption {
  user_id: string
  email: string
}

export function NotificationSettings({ orgId }: { orgId: string }) {
  const supabase = createClient()

  const [subscriptions, setSubscriptions] = useState<NotificationSubscription[]>([])
  const [locations, setLocations] = useState<OrgLocation[]>([])
  const [members, setMembers] = useState<OrgMemberOption[]>([])
  const [loading, setLoading] = useState(true)

  // Add form state
  const [addingFor, setAddingFor] = useState<NotificationAlertType | null>(null)
  const [addType, setAddType] = useState<SubscriberType>('all_members')
  const [addValue, setAddValue] = useState('')
  const [addLocationId, setAddLocationId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState('')

  const loadSubscriptions = useCallback(async () => {
    const res = await fetch(`/api/notifications/subscriptions?org_id=${orgId}`)
    if (res.ok) {
      const data = await res.json()
      setSubscriptions(data.subscriptions || [])
    }
  }, [orgId])

  useEffect(() => {
    async function load() {
      // Load locations for the org
      const { data: locs } = await supabase
        .from('locations')
        .select('id, name')
        .eq('org_id', orgId)
        .eq('active', true)
        .order('name')

      setLocations(locs || [])

      // Load org members for the member picker
      const { data: orgMembers } = await supabase
        .from('org_members')
        .select('user_id')
        .eq('org_id', orgId)

      if (orgMembers) {
        setMembers(orgMembers.map(m => ({ user_id: m.user_id, email: m.user_id })))
      }

      await loadSubscriptions()
      setLoading(false)
    }
    load()
  }, [orgId, supabase, loadSubscriptions])

  const handleAdd = async (alertType: NotificationAlertType) => {
    setSaving(true)
    setError('')

    const body: Record<string, unknown> = {
      org_id: orgId,
      alert_type: alertType,
      subscriber_type: addType,
      location_id: addLocationId || null,
    }

    if (addType === 'email') {
      if (!addValue || !addValue.includes('@')) {
        setError('Enter a valid email address')
        setSaving(false)
        return
      }
      body.subscriber_value = addValue.trim()
    } else if (addType === 'user') {
      if (!addValue) {
        setError('Select a member')
        setSaving(false)
        return
      }
      body.subscriber_value = addValue
    }

    const res = await fetch('/api/notifications/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      await loadSubscriptions()
      setAddingFor(null)
      setAddType('all_members')
      setAddValue('')
      setAddLocationId('')
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to add subscription')
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)

    const res = await fetch('/api/notifications/subscriptions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })

    if (res.ok) {
      await loadSubscriptions()
    }
    setDeleting(null)
  }

  if (loading) {
    return <div className="text-warm-gray text-sm">Loading...</div>
  }

  // Group subscriptions by alert type
  const subsByType = new Map<NotificationAlertType, NotificationSubscription[]>()
  for (const type of ALERT_TYPES) {
    subsByType.set(type, subscriptions.filter(s => s.alert_type === type))
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-warm-gray">
        Configure who receives email alerts for this organization.
      </p>

      {ALERT_TYPES.map(type => {
        const typeSubs = subsByType.get(type) || []

        return (
          <div key={type} className="border border-warm-border rounded-xl">
            <div className="px-5 py-4 border-b border-warm-border/50">
              <div className="text-sm text-ink font-medium">{ALERT_TYPE_LABELS[type]}</div>
              <div className="text-xs text-warm-gray mt-0.5">{ALERT_TYPE_DESCRIPTIONS[type]}</div>
            </div>

            {/* Subscriber list */}
            {typeSubs.length > 0 ? (
              <div className="divide-y divide-warm-border/30">
                {typeSubs.map(sub => (
                  <div key={sub.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-ink truncate">
                        {sub.subscriber_display || SUBSCRIBER_TYPE_LABELS[sub.subscriber_type]}
                      </div>
                      <div className="text-[11px] text-warm-gray mt-0.5">
                        {sub.location_id ? sub.location_name || 'Specific location' : 'All locations'}
                        {sub.subscriber_type !== 'all_members' && (
                          <span className="ml-2 text-warm-gray/60">
                            {SUBSCRIBER_TYPE_LABELS[sub.subscriber_type]}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(sub.id)}
                      disabled={deleting === sub.id}
                      className="text-warm-gray hover:text-ink text-xs transition-colors shrink-0 disabled:opacity-50"
                      aria-label="Remove subscription"
                    >
                      {deleting === sub.id ? '...' : 'Remove'}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-6 text-center">
                <p className="text-xs text-warm-gray">No subscribers configured</p>
              </div>
            )}

            {/* Add subscriber */}
            <div className="border-t border-warm-border/50 px-5 py-3">
              {addingFor === type ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={addType}
                      onChange={e => { setAddType(e.target.value as SubscriberType); setAddValue('') }}
                      className="px-3 py-1.5 bg-cream border border-warm-border rounded-lg text-sm text-ink outline-none focus:ring-1 focus:ring-warm-gray"
                    >
                      <option value="all_members">All org members</option>
                      <option value="user">Specific member</option>
                      <option value="email">Email address</option>
                    </select>

                    <select
                      value={addLocationId}
                      onChange={e => setAddLocationId(e.target.value)}
                      className="px-3 py-1.5 bg-cream border border-warm-border rounded-lg text-sm text-ink outline-none focus:ring-1 focus:ring-warm-gray"
                    >
                      <option value="">All locations</option>
                      {locations.map(loc => (
                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                      ))}
                    </select>
                  </div>

                  {addType === 'email' && (
                    <input
                      type="email"
                      value={addValue}
                      onChange={e => setAddValue(e.target.value)}
                      placeholder="email@example.com"
                      className="w-full px-3 py-1.5 bg-cream border border-warm-border rounded-lg text-sm text-ink outline-none focus:ring-1 focus:ring-warm-gray placeholder:text-warm-gray/50"
                    />
                  )}

                  {addType === 'user' && (
                    <select
                      value={addValue}
                      onChange={e => setAddValue(e.target.value)}
                      className="w-full px-3 py-1.5 bg-cream border border-warm-border rounded-lg text-sm text-ink outline-none focus:ring-1 focus:ring-warm-gray"
                    >
                      <option value="">Select a member...</option>
                      {members.map(m => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.email === m.user_id ? m.user_id.slice(0, 8) + '...' : m.email}
                        </option>
                      ))}
                    </select>
                  )}

                  {error && addingFor === type && (
                    <p className="text-red-600 text-xs">{error}</p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAdd(type)}
                      disabled={saving}
                      className="px-4 py-1.5 bg-ink hover:bg-ink/90 text-cream text-xs font-medium rounded-full transition-colors disabled:opacity-50"
                    >
                      {saving ? 'Adding...' : 'Add'}
                    </button>
                    <button
                      onClick={() => { setAddingFor(null); setError('') }}
                      className="px-4 py-1.5 text-warm-gray hover:text-ink text-xs transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setAddingFor(type); setAddType('all_members'); setAddValue(''); setAddLocationId(''); setError('') }}
                  className="text-xs text-warm-gray hover:text-ink transition-colors"
                >
                  + Add subscriber
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
