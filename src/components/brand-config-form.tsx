'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface BrandConfigData {
  brand_voice: string | null
  design_style: string | null
  primary_color: string | null
  secondary_color: string | null
  font_style: string | null
  sample_image_urls: string[]
}

export function BrandConfigForm({
  orgId,
  config,
}: {
  orgId: string
  config: BrandConfigData | null
}) {
  const [form, setForm] = useState<BrandConfigData>(config || {
    brand_voice: null,
    design_style: null,
    primary_color: null,
    secondary_color: null,
    font_style: null,
    sample_image_urls: [],
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()

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
    <div className="space-y-6">
      {/* Brand Voice */}
      <div>
        <label className="text-sm font-medium text-ink block mb-2">Brand Voice</label>
        <textarea
          value={form.brand_voice || ''}
          onChange={(e) => setForm({ ...form, brand_voice: e.target.value || null })}
          placeholder="warm, family-friendly, professional, trustworthy"
          rows={2}
          className="w-full px-3 py-2 border border-warm-border rounded-lg text-sm text-ink outline-none focus:ring-2 focus:ring-ink/20 resize-y placeholder:text-warm-gray"
        />
        <div className="text-xs text-warm-gray mt-1">
          Describes the tone AI uses for post copy (e.g., "warm and personal", "concise and professional")
        </div>
      </div>

      {/* Design Style */}
      <div>
        <label className="text-sm font-medium text-ink block mb-2">Image Design Style</label>
        <textarea
          value={form.design_style || ''}
          onChange={(e) => setForm({ ...form, design_style: e.target.value || null })}
          placeholder="bold text on color gradients, premium and aspirational feel, clean corporate design"
          rows={2}
          className="w-full px-3 py-2 border border-warm-border rounded-lg text-sm text-ink outline-none focus:ring-2 focus:ring-ink/20 resize-y placeholder:text-warm-gray"
        />
        <div className="text-xs text-warm-gray mt-1">
          Guides AI image generation style. Use "photo background" for blurred photo overlays, or describe gradient/minimal styles.
        </div>
      </div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-ink block mb-2">Primary Color</label>
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
          <label className="text-sm font-medium text-ink block mb-2">Secondary Color</label>
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

      {/* Font Style */}
      <div>
        <label className="text-sm font-medium text-ink block mb-2">Font Style</label>
        <input
          type="text"
          value={form.font_style || ''}
          onChange={(e) => setForm({ ...form, font_style: e.target.value || null })}
          placeholder="heavy sans-serif, Impact-like condensed"
          className="w-full px-3 py-2 border border-warm-border rounded-lg text-sm text-ink outline-none focus:ring-2 focus:ring-ink/20 placeholder:text-warm-gray"
        />
        <div className="text-xs text-warm-gray mt-1">
          Font description for image generation (used in Ideogram prompts)
        </div>
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
