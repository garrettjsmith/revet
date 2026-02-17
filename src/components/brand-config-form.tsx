'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { VoiceSelections, StyleSelections } from '@/lib/types'

// ─── Options (shared with intake-form) ─────────────────────

const PERSONALITY_OPTIONS = [
  'Professional & Authoritative',
  'Friendly & Approachable',
  'Bold & Confident',
  'Casual & Conversational',
  'Luxury & Exclusive',
  'Innovative & Tech-Savvy',
]

const TONE_OPTIONS = [
  'Short & Direct',
  'Storytelling & Engaging',
  'Educational & Informative',
  'Persuasive & Sales-Driven',
  'Quirky & Playful',
]

const FORMALITY_OPTIONS = [
  'Formal & Traditional',
  'Neutral & Balanced',
  'Casual & Relaxed',
  'Edgy & Bold',
]

const AESTHETIC_OPTIONS = [
  'Clean & Minimalist',
  'Bold & Eye-Catching',
  'Classic & Timeless',
  'Fun & Playful',
  'Luxury & High-End',
  'Edgy & Modern',
]

const COLOR_MOOD_OPTIONS = [
  'Bright & Vibrant',
  'Soft & Neutral',
  'Dark & Moody',
  'Corporate & Professional',
  'Monochrome & Minimal',
]

const TYPOGRAPHY_OPTIONS = [
  'Classic & Serif',
  'Modern & Sans-Serif',
  'Handwritten & Casual',
  'Bold & Heavy',
]

// ─── Chip Components ───────────────────────────────────────

function ChipSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="text-sm font-medium text-ink block mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(value === opt ? '' : opt)}
            className={`text-sm rounded-full px-4 py-2 border transition-colors ${
              value === opt
                ? 'bg-ink text-cream border-ink'
                : 'bg-cream text-ink border-warm-border hover:border-ink/40'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

function ChipMultiSelect({
  label,
  options,
  value,
  onChange,
  max,
}: {
  label: string
  options: string[]
  value: string[]
  onChange: (v: string[]) => void
  max: number
}) {
  return (
    <div>
      <label className="text-sm font-medium text-ink block mb-2">
        {label} <span className="text-warm-gray font-normal">(up to {max})</span>
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = value.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              onClick={() => {
                if (selected) {
                  onChange(value.filter((v) => v !== opt))
                } else if (value.length < max) {
                  onChange([...value, opt])
                }
              }}
              className={`text-sm rounded-full px-4 py-2 border transition-colors ${
                selected
                  ? 'bg-ink text-cream border-ink'
                  : value.length >= max
                    ? 'bg-cream/50 text-warm-gray border-warm-border/50 cursor-not-allowed'
                    : 'bg-cream text-ink border-warm-border hover:border-ink/40'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Form ──────────────────────────────────────────────────

interface BrandConfigData {
  primary_color: string | null
  secondary_color: string | null
  voice_selections: VoiceSelections
  style_selections: StyleSelections
}

export function BrandConfigForm({
  orgId,
  config,
}: {
  orgId: string
  config: BrandConfigData | null
}) {
  const [form, setForm] = useState<BrandConfigData>(config || {
    primary_color: null,
    secondary_color: null,
    voice_selections: {},
    style_selections: {},
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()

  const voice = form.voice_selections
  const style = form.style_selections

  const setVoice = (patch: Partial<VoiceSelections>) =>
    setForm({ ...form, voice_selections: { ...voice, ...patch } })

  const setStyle = (patch: Partial<StyleSelections>) =>
    setForm({ ...form, style_selections: { ...style, ...patch } })

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch(`/api/orgs/${orgId}/brand-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setSaved(true)
        router.refresh()
      }
    } catch (err) {
      console.error('Failed to save brand config:', err)
    }
    setSaving(false)
  }

  return (
    <div className="space-y-8">
      {/* ── Voice ── */}
      <div>
        <h3 className="font-serif text-lg text-ink mb-4">Voice</h3>
        <div className="space-y-5">
          <ChipSelect
            label="Personality"
            options={PERSONALITY_OPTIONS}
            value={voice.personality || ''}
            onChange={(v) => setVoice({ personality: v || undefined })}
          />
          <ChipMultiSelect
            label="Tone"
            options={TONE_OPTIONS}
            value={voice.tone || []}
            onChange={(v) => setVoice({ tone: v.length ? v : undefined })}
            max={3}
          />
          <ChipSelect
            label="Formality"
            options={FORMALITY_OPTIONS}
            value={voice.formality || ''}
            onChange={(v) => setVoice({ formality: v || undefined })}
          />
          <div>
            <label className="text-sm font-medium text-ink block mb-2">
              Additional notes <span className="text-warm-gray font-normal">(optional)</span>
            </label>
            <textarea
              value={voice.notes || ''}
              onChange={(e) => setVoice({ notes: e.target.value || undefined })}
              placeholder="e.g. Never use exclamation marks, always mention family-owned"
              rows={2}
              className="w-full px-3 py-2 border border-warm-border rounded-lg text-sm text-ink outline-none focus:ring-2 focus:ring-ink/20 resize-y placeholder:text-warm-gray"
            />
          </div>
        </div>
      </div>

      {/* ── Style ── */}
      <div>
        <h3 className="font-serif text-lg text-ink mb-4">Style</h3>
        <div className="space-y-5">
          <ChipSelect
            label="Image Aesthetic"
            options={AESTHETIC_OPTIONS}
            value={style.aesthetic || ''}
            onChange={(v) => setStyle({ aesthetic: v || undefined })}
          />
          <ChipSelect
            label="Color Mood"
            options={COLOR_MOOD_OPTIONS}
            value={style.color_mood || ''}
            onChange={(v) => setStyle({ color_mood: v || undefined })}
          />
          <ChipSelect
            label="Typography"
            options={TYPOGRAPHY_OPTIONS}
            value={style.typography || ''}
            onChange={(v) => setStyle({ typography: v || undefined })}
          />
          <div>
            <label className="text-sm font-medium text-ink block mb-2">
              Additional notes <span className="text-warm-gray font-normal">(optional)</span>
            </label>
            <textarea
              value={style.notes || ''}
              onChange={(e) => setStyle({ notes: e.target.value || undefined })}
              placeholder="e.g. Use photo backgrounds, avoid gradients"
              rows={2}
              className="w-full px-3 py-2 border border-warm-border rounded-lg text-sm text-ink outline-none focus:ring-2 focus:ring-ink/20 resize-y placeholder:text-warm-gray"
            />
          </div>
        </div>
      </div>

      {/* ── Colors ── */}
      <div>
        <h3 className="font-serif text-lg text-ink mb-4">Colors</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-ink block mb-2">Primary</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.primary_color || '#1A1A1A'}
                onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                className="w-10 h-10 rounded-lg border border-warm-border cursor-pointer"
              />
              <input
                type="text"
                value={form.primary_color || ''}
                onChange={(e) => setForm({ ...form, primary_color: e.target.value || null })}
                placeholder="#1A1A1A"
                className="flex-1 px-3 py-2 border border-warm-border rounded-lg text-sm text-ink font-mono outline-none focus:ring-2 focus:ring-ink/20 placeholder:text-warm-gray"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-ink block mb-2">Secondary</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.secondary_color || '#333333'}
                onChange={(e) => setForm({ ...form, secondary_color: e.target.value })}
                className="w-10 h-10 rounded-lg border border-warm-border cursor-pointer"
              />
              <input
                type="text"
                value={form.secondary_color || ''}
                onChange={(e) => setForm({ ...form, secondary_color: e.target.value || null })}
                placeholder="#333333"
                className="flex-1 px-3 py-2 border border-warm-border rounded-lg text-sm text-ink font-mono outline-none focus:ring-2 focus:ring-ink/20 placeholder:text-warm-gray"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Save ── */}
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
