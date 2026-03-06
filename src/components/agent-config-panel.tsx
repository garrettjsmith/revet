'use client'

import { useState } from 'react'

interface AgentConfig {
  id?: string
  location_id: string
  enabled: boolean
  review_replies: string
  profile_updates: string
  post_publishing: string
  auto_reply_min_rating: number
  auto_reply_max_rating: number
  escalate_below_rating: number
  tone: string
  business_context: string | null
}

interface ActivityEntry {
  id: string
  location_id: string
  action_type: string
  status: string
  summary: string
  details: Record<string, unknown> | null
  created_at: string
}

const DEFAULTS: Omit<AgentConfig, 'id'> = {
  location_id: '',
  enabled: false,
  review_replies: 'queue',
  profile_updates: 'queue',
  post_publishing: 'queue',
  auto_reply_min_rating: 4,
  auto_reply_max_rating: 5,
  escalate_below_rating: 3,
  tone: 'professional and friendly',
  business_context: null,
}

const TRUST_OPTIONS = [
  { value: 'auto', label: 'Auto', desc: 'Agent acts immediately' },
  { value: 'queue', label: 'Queue', desc: 'Agent drafts, human approves' },
  { value: 'off', label: 'Off', desc: 'Agent skips this entirely' },
]

const ACTION_LABELS: Record<string, string> = {
  review_reply: 'Review Reply',
  profile_update: 'Profile Update',
  post_published: 'Post Published',
  post_generated: 'Post Generated',
  audit_completed: 'Audit Completed',
  recommendation_applied: 'Recommendation Applied',
  recommendation_queued: 'Recommendation Queued',
  escalated: 'Escalated',
}

const STATUS_STYLES: Record<string, string> = {
  completed: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  queued: 'text-amber-700 bg-amber-50 border-amber-200',
  failed: 'text-red-700 bg-red-50 border-red-200',
  escalated: 'text-orange-700 bg-orange-50 border-orange-200',
}

export function AgentConfigPanel({
  locationId,
  config: initialConfig,
  activity,
  isAdmin,
}: {
  locationId: string
  config: AgentConfig | null
  activity: ActivityEntry[]
  isAdmin: boolean
}) {
  const merged = { ...DEFAULTS, ...initialConfig, location_id: locationId }
  const [config, setConfig] = useState<AgentConfig>(merged)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<string | null>(null)

  const update = (field: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/locations/${locationId}/agent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (res.ok) setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  const handleRun = async () => {
    setRunning(true)
    setRunResult(null)
    try {
      const res = await fetch(`/api/locations/${locationId}/agent`, {
        method: 'POST',
      })
      const data = await res.json()
      if (data.actions?.length > 0) {
        setRunResult(`${data.actions.length} action(s) taken. Audit score: ${data.audit_score ?? 'N/A'}`)
      } else {
        setRunResult('Agent run complete. No actions needed.')
      }
    } catch {
      setRunResult('Agent run failed.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Config section — agency admin only */}
      {isAdmin ? (
        <div className="border border-warm-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-warm-border bg-warm-light/30 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-ink">Configuration</h2>
              <p className="text-xs text-warm-gray mt-0.5">Control how the agent operates for this location</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-warm-gray">{config.enabled ? 'Enabled' : 'Disabled'}</span>
              <button
                type="button"
                role="switch"
                aria-checked={config.enabled}
                onClick={() => update('enabled', !config.enabled)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  config.enabled ? 'bg-emerald-500' : 'bg-warm-gray/30'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    config.enabled ? 'translate-x-4.5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </label>
          </div>

          <div className="p-5 space-y-6">
            {/* Trust levels */}
            <div>
              <h3 className="text-xs font-medium text-ink uppercase tracking-wider mb-3">Trust Levels</h3>
              <div className="space-y-3">
                {[
                  { key: 'review_replies', label: 'Review Replies' },
                  { key: 'profile_updates', label: 'Profile Updates' },
                  { key: 'post_publishing', label: 'Post Publishing' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-ink">{label}</span>
                    <div className="flex gap-1">
                      {TRUST_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => update(key, opt.value)}
                          title={opt.desc}
                          className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                            config[key as keyof AgentConfig] === opt.value
                              ? 'bg-ink text-cream border-ink'
                              : 'bg-white text-warm-gray border-warm-border hover:border-ink hover:text-ink'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Guardrails */}
            <div>
              <h3 className="text-xs font-medium text-ink uppercase tracking-wider mb-3">Review Guardrails</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] text-warm-gray uppercase tracking-wider block mb-1">Auto-reply min rating</label>
                  <select
                    value={config.auto_reply_min_rating}
                    onChange={(e) => update('auto_reply_min_rating', Number(e.target.value))}
                    className="w-full border border-warm-border rounded-lg px-3 py-1.5 text-sm bg-white text-ink"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n} star{n !== 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-warm-gray uppercase tracking-wider block mb-1">Auto-reply max rating</label>
                  <select
                    value={config.auto_reply_max_rating}
                    onChange={(e) => update('auto_reply_max_rating', Number(e.target.value))}
                    className="w-full border border-warm-border rounded-lg px-3 py-1.5 text-sm bg-white text-ink"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n} star{n !== 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-warm-gray uppercase tracking-wider block mb-1">Escalate below</label>
                  <select
                    value={config.escalate_below_rating}
                    onChange={(e) => update('escalate_below_rating', Number(e.target.value))}
                    className="w-full border border-warm-border rounded-lg px-3 py-1.5 text-sm bg-white text-ink"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n} star{n !== 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Tone & context */}
            <div>
              <h3 className="text-xs font-medium text-ink uppercase tracking-wider mb-3">Brand Voice</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-warm-gray uppercase tracking-wider block mb-1">Tone</label>
                  <input
                    type="text"
                    value={config.tone}
                    onChange={(e) => update('tone', e.target.value)}
                    className="w-full border border-warm-border rounded-lg px-3 py-1.5 text-sm bg-white text-ink"
                    placeholder="professional and friendly"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-warm-gray uppercase tracking-wider block mb-1">Business context</label>
                  <textarea
                    value={config.business_context || ''}
                    onChange={(e) => update('business_context', e.target.value || null)}
                    rows={3}
                    className="w-full border border-warm-border rounded-lg px-3 py-1.5 text-sm bg-white text-ink resize-none"
                    placeholder="Optional context about this business for the agent..."
                  />
                </div>
              </div>
            </div>

            {/* Save + Run */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-ink text-cream text-sm rounded-full hover:bg-ink/90 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : saved ? 'Saved' : 'Save'}
              </button>
              <button
                onClick={handleRun}
                disabled={running}
                className="px-5 py-2 border border-warm-border text-ink text-sm rounded-full hover:bg-warm-light transition-colors disabled:opacity-50"
              >
                {running ? 'Running...' : 'Run Agent Now'}
              </button>
              {runResult && (
                <span className="text-xs text-warm-gray">{runResult}</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="border border-warm-border rounded-xl p-5">
          <p className="text-sm text-warm-gray">Agent configuration is managed by the agency.</p>
        </div>
      )}

      {/* Activity log */}
      <div className="border border-warm-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-warm-border bg-warm-light/30">
          <h2 className="text-sm font-medium text-ink">Activity Log</h2>
          <p className="text-xs text-warm-gray mt-0.5">Recent agent actions for this location</p>
        </div>

        {activity.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-warm-gray">No agent activity yet.</p>
            <p className="text-xs text-warm-gray mt-1">Activity will appear here once the agent starts running.</p>
          </div>
        ) : (
          <div className="divide-y divide-warm-border/50">
            {activity.map((entry) => {
              const statusStyle = STATUS_STYLES[entry.status] || STATUS_STYLES.completed
              return (
                <div key={entry.id} className="px-5 py-3 flex items-start gap-3">
                  <div className="shrink-0 mt-0.5">
                    <div className={`w-2 h-2 rounded-full ${
                      entry.status === 'completed' ? 'bg-emerald-500' :
                      entry.status === 'queued' ? 'bg-amber-500' :
                      entry.status === 'failed' ? 'bg-red-500' :
                      'bg-orange-500'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-ink">
                        {ACTION_LABELS[entry.action_type] || entry.action_type}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusStyle}`}>
                        {entry.status}
                      </span>
                    </div>
                    <p className="text-xs text-warm-gray leading-relaxed">{entry.summary}</p>
                  </div>
                  <span className="text-[10px] text-warm-gray shrink-0">
                    {new Date(entry.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    {new Date(entry.created_at).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
