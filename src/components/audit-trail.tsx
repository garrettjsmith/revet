'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface AuditLog {
  id: string
  actor_id: string | null
  actor_email: string | null
  action: string
  resource_type: string
  resource_id: string | null
  metadata: Record<string, any>
  created_at: string
}

interface AuditTrailProps {
  resourceType: string
  resourceId: string
  limit?: number
}

const ACTION_LABELS: Record<string, (metadata: Record<string, any>) => string> = {
  'location.moved': (meta) => `Moved to ${meta.to_org_name || 'another organization'}`,
  'location.created': () => 'Created',
  'location.archived': () => 'Archived',
  'location.paused': () => 'Sync paused',
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 7) return `${diffDay}d ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getActionLabel(log: AuditLog): string {
  const labelFn = ACTION_LABELS[log.action]
  return labelFn ? labelFn(log.metadata) : log.action
}

function getActionDetail(log: AuditLog): string | null {
  if (log.action === 'location.moved' && log.metadata.from_org_name && log.metadata.to_org_name) {
    return `from ${log.metadata.from_org_name} → ${log.metadata.to_org_name}`
  }
  return null
}

export default function AuditTrail({ resourceType, resourceId, limit = 10 }: AuditTrailProps) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchLogs() {
      try {
        const { data, error } = await supabase
          .from('audit_log')
          .select('*')
          .eq('resource_type', resourceType)
          .eq('resource_id', resourceId)
          .order('created_at', { ascending: false })
          .limit(limit)

        if (error) {
          console.error('Error fetching audit logs:', error)
          return
        }

        setLogs(data || [])
      } finally {
        setLoading(false)
      }
    }

    fetchLogs()
  }, [resourceType, resourceId, limit, supabase])

  if (loading) {
    return (
      <div className="border border-warm-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-ink mb-4">Activity</h2>
        <div className="text-xs text-warm-gray">Loading...</div>
      </div>
    )
  }

  if (logs.length === 0) {
    return null
  }

  return (
    <div className="border border-warm-border rounded-xl p-5">
      <h2 className="text-sm font-semibold text-ink mb-4">Activity</h2>
      <div className="space-y-4">
        {logs.map((log, idx) => {
          const isRecent = idx === 0
          const actionLabel = getActionLabel(log)
          const actionDetail = getActionDetail(log)
          const relativeTime = formatRelativeTime(log.created_at)

          return (
            <div key={log.id} className="flex gap-3">
              <div className="flex-shrink-0 pt-1.5">
                <div className={`w-2 h-2 rounded-full ${isRecent ? 'bg-ink' : 'bg-warm-border'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink font-medium">{actionLabel}</div>
                    {log.actor_email && (
                      <div className="text-xs text-warm-gray mt-0.5">
                        by {log.actor_email}
                      </div>
                    )}
                    {actionDetail && (
                      <div className="text-xs text-warm-gray mt-0.5">
                        {actionDetail}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-warm-gray whitespace-nowrap">
                    {relativeTime}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
