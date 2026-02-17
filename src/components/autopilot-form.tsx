'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface AutopilotConfig {
  location_id: string
  enabled: boolean
  auto_reply_ratings: number[]
  tone: string
  business_context: string | null
  delay_min_minutes: number
  delay_max_minutes: number
  require_approval: boolean
}

export function AutopilotForm({ config }: { config: AutopilotConfig }) {
  const [form, setForm] = useState(config)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()

  const handleToggleRating = (rating: number) => {
    const ratings = form.auto_reply_ratings.includes(rating)
      ? form.auto_reply_ratings.filter((r) => r !== rating)
      : [...form.auto_reply_ratings, rating].sort()
    setForm({ ...form, auto_reply_ratings: ratings })
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch(`/api/locations/${config.location_id}/autopilot`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setSaved(true)
        router.refresh()
      }
    } catch (err) {
      console.error('Failed to save autopilot config:', err)
    }
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-ink">Enable Autopilot</div>
          <div className="text-xs text-warm-gray mt-0.5">
            Automatically generate and post AI replies to new reviews
          </div>
        </div>
        <button
          onClick={() => setForm({ ...form, enabled: !form.enabled })}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            form.enabled ? 'bg-ink' : 'bg-warm-border'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              form.enabled ? 'translate-x-5' : ''
            }`}
          />
        </button>
      </div>

      {/* Auto-reply ratings */}
      <div>
        <div className="text-sm font-medium text-ink mb-2">Auto-reply to ratings</div>
        <div className="text-xs text-warm-gray mb-3">
          Select which star ratings should receive automatic replies
        </div>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((rating) => (
            <button
              key={rating}
              onClick={() => handleToggleRating(rating)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs transition-colors ${
                form.auto_reply_ratings.includes(rating)
                  ? 'bg-ink text-cream'
                  : 'border border-warm-border text-warm-gray hover:text-ink'
              }`}
            >
              {rating}★
            </button>
          ))}
        </div>
      </div>

      {/* Tone */}
      <div>
        <label className="text-sm font-medium text-ink block mb-2">Tone</label>
        <input
          type="text"
          value={form.tone}
          onChange={(e) => setForm({ ...form, tone: e.target.value })}
          placeholder="professional and friendly"
          className="w-full px-3 py-2 border border-warm-border rounded-lg text-sm text-ink outline-none focus:ring-2 focus:ring-ink/20 placeholder:text-warm-gray"
        />
        <div className="text-xs text-warm-gray mt-1">
          Describes how the AI should write replies (e.g., "warm and personal", "concise and professional")
        </div>
      </div>

      {/* Business context */}
      <div>
        <label className="text-sm font-medium text-ink block mb-2">Business Context</label>
        <textarea
          value={form.business_context || ''}
          onChange={(e) => setForm({ ...form, business_context: e.target.value || null })}
          placeholder="A family dental practice serving the downtown area since 1995..."
          rows={3}
          className="w-full px-3 py-2 border border-warm-border rounded-lg text-sm text-ink outline-none focus:ring-2 focus:ring-ink/20 resize-y placeholder:text-warm-gray"
        />
        <div className="text-xs text-warm-gray mt-1">
          Brief description of the business for the AI to reference in replies
        </div>
      </div>

      {/* Delay range */}
      <div>
        <div className="text-sm font-medium text-ink mb-2">Reply Delay</div>
        <div className="text-xs text-warm-gray mb-3">
          Random delay before posting (makes replies look natural)
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={5}
              max={1440}
              value={form.delay_min_minutes}
              onChange={(e) => setForm({ ...form, delay_min_minutes: parseInt(e.target.value) || 30 })}
              className="w-20 px-3 py-2 border border-warm-border rounded-lg text-sm text-ink outline-none focus:ring-2 focus:ring-ink/20"
            />
            <span className="text-xs text-warm-gray">min</span>
          </div>
          <span className="text-warm-gray">to</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={5}
              max={1440}
              value={form.delay_max_minutes}
              onChange={(e) => setForm({ ...form, delay_max_minutes: parseInt(e.target.value) || 180 })}
              className="w-20 px-3 py-2 border border-warm-border rounded-lg text-sm text-ink outline-none focus:ring-2 focus:ring-ink/20"
            />
            <span className="text-xs text-warm-gray">max minutes</span>
          </div>
        </div>
      </div>

      {/* Require approval */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-ink">Require Approval</div>
          <div className="text-xs text-warm-gray mt-0.5">
            When enabled, AI drafts are generated but must be manually approved before posting
          </div>
        </div>
        <button
          onClick={() => setForm({ ...form, require_approval: !form.require_approval })}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            form.require_approval ? 'bg-ink' : 'bg-warm-border'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              form.require_approval ? 'translate-x-5' : ''
            }`}
          />
        </button>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-ink hover:bg-ink/90 text-cream text-sm font-medium rounded-full transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        {saved && (
          <span className="text-xs text-emerald-600">Saved</span>
        )}
      </div>
    </div>
  )
}
