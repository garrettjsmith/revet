'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import { NotificationSettings } from '@/components/notification-settings'
import type { NotificationAlertType, NotificationSubscription } from '@/lib/types'

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

export default function NotificationsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string
  const supabase = createClient()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [isAgencyAdmin, setIsAgencyAdmin] = useState<boolean | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [subscriptions, setSubscriptions] = useState<NotificationSubscription[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .single()

      if (!org) return
      setOrgId(org.id)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserEmail(user.email ?? null)

      // Check agency admin
      const { data: membership } = await supabase
        .from('org_members')
        .select('is_agency_admin')
        .eq('user_id', user.id)
        .eq('is_agency_admin', true)
        .limit(1)
        .maybeSingle()

      const isAdmin = !!membership
      setIsAgencyAdmin(isAdmin)

      // Non-admins need subscriptions for the read-only view
      if (!isAdmin) {
        const res = await fetch(`/api/notifications/subscriptions?org_id=${org.id}`)
        if (res.ok) {
          const data = await res.json()
          setSubscriptions(data.subscriptions || [])
        }
      }

      setLoading(false)
    }
    load()
  }, [orgSlug, supabase])

  if (loading || isAgencyAdmin === null) {
    return <div className="text-warm-gray text-sm">Loading...</div>
  }

  // Agency admin — use the full config component
  if (isAgencyAdmin && orgId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-serif text-ink">Notification Settings</h1>
        <NotificationSettings orgId={orgId} />
      </div>
    )
  }

  // Read-only view for non-admin members
  const userSubs = subscriptions.filter(s =>
    s.subscriber_type === 'all_members' ||
    (s.subscriber_type === 'user' && s.subscriber_value === userEmail) ||
    (s.subscriber_type === 'email' && s.subscriber_value === userEmail)
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif text-ink">Notifications</h1>
        <p className="text-sm text-warm-gray mt-1">
          Email alerts configured for this organization.
        </p>
      </div>

      {userSubs.length === 0 ? (
        <div className="border border-warm-border rounded-xl p-8 text-center">
          <p className="text-sm text-warm-gray">
            No notifications configured for your account yet. Contact your administrator.
          </p>
        </div>
      ) : (
        <div className="border border-warm-border rounded-xl divide-y divide-warm-border/50">
          {ALERT_TYPES.map(type => {
            const typeSubs = userSubs.filter(s => s.alert_type === type)
            if (typeSubs.length === 0) return null
            return (
              <div key={type} className="px-5 py-4 flex items-center justify-between">
                <div>
                  <div className="text-sm text-ink font-medium">{ALERT_TYPE_LABELS[type]}</div>
                  <div className="text-xs text-warm-gray mt-0.5">{ALERT_TYPE_DESCRIPTIONS[type]}</div>
                </div>
                <span className="text-xs text-warm-gray bg-warm-light px-2.5 py-1 rounded-full">
                  {typeSubs.some(s => s.location_id === null) ? 'All locations' : `${typeSubs.length} location${typeSubs.length !== 1 ? 's' : ''}`}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
