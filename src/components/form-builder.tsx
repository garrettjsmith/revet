'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { FormTemplate, FormField, FormFieldType } from '@/lib/types'

interface Props {
  form?: FormTemplate
  orgId: string
  orgSlug: string
  locationId: string
  orgMembers?: { email: string; name?: string }[]
}

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'select', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
]

function generateFieldId() {
  return 'f_' + Math.random().toString(36).substring(2, 8)
}

const DEFAULT_FIELDS: FormField[] = [
  { id: generateFieldId(), type: 'text', label: 'Name', placeholder: 'Your name', required: true },
  { id: generateFieldId(), type: 'email', label: 'Email', placeholder: 'your@email.com', required: true },
  { id: generateFieldId(), type: 'phone', label: 'Phone', placeholder: '(555) 555-5555', required: false },
  { id: generateFieldId(), type: 'textarea', label: 'Message', placeholder: 'How can we help?', required: false },
]

export function FormBuilder({ form: existingForm, orgId, orgSlug, locationId, orgMembers }: Props) {
  const isEditing = !!existingForm
  const router = useRouter()
  const supabase = createClient()

  const basePath = `/admin/${orgSlug}/locations/${locationId}/forms`

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    name: existingForm?.name || '',
    slug: existingForm?.slug || '',
    description: existingForm?.description || '',
    heading: existingForm?.heading || 'Contact Us',
    subtext: existingForm?.subtext || 'Fill out the form below and we will get back to you shortly.',
    primary_color: existingForm?.primary_color || '#1B4965',
    logo_url: existingForm?.logo_url || '',
    logo_text: existingForm?.logo_text || '',
    logo_subtext: existingForm?.logo_subtext || '',
    alert_email: existingForm?.alert_email || '',
    alert_enabled: existingForm?.alert_enabled ?? true,
    confirmation_heading: existingForm?.confirmation_heading || 'Thank you!',
    confirmation_message: existingForm?.confirmation_message || 'We have received your submission and will be in touch soon.',
    active: existingForm?.active ?? true,
  })

  const [fields, setFields] = useState<FormField[]>(
    existingForm?.fields?.length ? existingForm.fields : DEFAULT_FIELDS
  )

  const set = (key: string, value: string | boolean) =>
    setFormData((f) => ({ ...f, [key]: value }))

  const autoSlug = (name: string) => {
    set('name', name)
    if (!isEditing) {
      set('slug', name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    }
  }

  // Field management
  const addField = () => {
    setFields([...fields, {
      id: generateFieldId(),
      type: 'text',
      label: '',
      placeholder: '',
      required: false,
    }])
  }

  const updateField = (index: number, updates: Partial<FormField>) => {
    setFields(fields.map((f, i) => i === index ? { ...f, ...updates } : f))
  }

  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index))
  }

  const moveField = (index: number, direction: 'up' | 'down') => {
    const newFields = [...fields]
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= fields.length) return
    ;[newFields[index], newFields[target]] = [newFields[target], newFields[index]]
    setFields(newFields)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    if (fields.length === 0) {
      setError('Add at least one field to the form.')
      setSaving(false)
      return
    }

    const payload = {
      ...formData,
      org_id: orgId,
      location_id: locationId,
      fields: fields,
      logo_url: formData.logo_url || null,
      logo_text: formData.logo_text || null,
      logo_subtext: formData.logo_subtext || null,
      alert_email: formData.alert_email || null,
      description: formData.description || null,
    }

    let result
    if (isEditing) {
      result = await supabase
        .from('form_templates')
        .update(payload)
        .eq('id', existingForm!.id)
    } else {
      result = await supabase.from('form_templates').insert(payload)
    }

    if (result.error) {
      setError(result.error.message)
      setSaving(false)
    } else {
      router.push(basePath)
      router.refresh()
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this form and all its submissions? This cannot be undone.')) return
    setSaving(true)
    await supabase.from('form_templates').delete().eq('id', existingForm!.id)
    router.push(basePath)
    router.refresh()
  }

  const inputClass =
    'w-full px-3.5 py-2.5 bg-ink border border-ink rounded-lg text-sm text-cream outline-none focus:ring-2 focus:ring-warm-gray transition-colors font-[inherit] placeholder:text-warm-gray'
  const labelClass = 'block text-[11px] text-warm-gray uppercase tracking-wider mb-1.5'

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-6">

        {/* Basic info */}
        <div className="border border-warm-border rounded-xl p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Form Name</label>
              <input
                value={formData.name}
                onChange={(e) => autoSlug(e.target.value)}
                placeholder="Contact Form"
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>URL Slug</label>
              <div className="flex items-center gap-0">
                <span className="text-xs text-warm-gray font-mono mr-1">/f/</span>
                <input
                  value={formData.slug}
                  onChange={(e) => set('slug', e.target.value)}
                  placeholder="contact"
                  className={inputClass}
                  required
                />
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass}>Description (internal only)</label>
            <input
              value={formData.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Main contact form for this location"
              className={inputClass}
            />
          </div>

          {/* Alert email */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Alert Email</label>
              {orgMembers && orgMembers.length > 0 ? (
                <select
                  value={formData.alert_email}
                  onChange={(e) => set('alert_email', e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select recipient...</option>
                  {orgMembers.map((m) => (
                    <option key={m.email} value={m.email}>
                      {m.email}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="email"
                  value={formData.alert_email}
                  onChange={(e) => set('alert_email', e.target.value)}
                  placeholder="alerts@example.com"
                  className={inputClass}
                />
              )}
              <p className="text-[10px] text-warm-gray mt-1">Receives email on each submission</p>
            </div>
            <div className="flex items-center gap-2 mt-6">
              <input
                type="checkbox"
                checked={formData.alert_enabled}
                onChange={(e) => set('alert_enabled', e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-warm-gray">Email alerts enabled</span>
            </div>
          </div>
        </div>

        {/* Form fields */}
        <div className="border border-warm-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-ink">Form Fields</h3>
            <button
              type="button"
              onClick={addField}
              className="text-xs text-warm-gray hover:text-ink transition-colors"
            >
              + Add Field
            </button>
          </div>

          {fields.length === 0 ? (
            <div className="text-center text-warm-gray text-sm py-8 border border-dashed border-warm-border rounded-lg">
              No fields yet. Click &quot;+ Add Field&quot; to start building your form.
            </div>
          ) : (
            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="bg-ink rounded-lg p-4">
                  <div className="grid grid-cols-12 gap-3">
                    {/* Reorder */}
                    <div className="col-span-1 flex flex-col items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveField(index, 'up')}
                        disabled={index === 0}
                        className="text-warm-gray hover:text-cream disabled:opacity-30 transition-colors text-xs"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => moveField(index, 'down')}
                        disabled={index === fields.length - 1}
                        className="text-warm-gray hover:text-cream disabled:opacity-30 transition-colors text-xs"
                      >
                        ▼
                      </button>
                    </div>

                    {/* Type */}
                    <div className="col-span-2">
                      <label className="block text-[10px] text-warm-gray uppercase tracking-wider mb-1">Type</label>
                      <select
                        value={field.type}
                        onChange={(e) => updateField(index, { type: e.target.value as FormFieldType })}
                        className="w-full px-2 py-1.5 bg-cream/10 border border-warm-gray/30 rounded text-xs text-cream outline-none"
                      >
                        {FIELD_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Label */}
                    <div className="col-span-3">
                      <label className="block text-[10px] text-warm-gray uppercase tracking-wider mb-1">Label</label>
                      <input
                        value={field.label}
                        onChange={(e) => updateField(index, { label: e.target.value })}
                        placeholder="Field label"
                        className="w-full px-2 py-1.5 bg-cream/10 border border-warm-gray/30 rounded text-xs text-cream outline-none"
                        required
                      />
                    </div>

                    {/* Placeholder */}
                    <div className="col-span-3">
                      <label className="block text-[10px] text-warm-gray uppercase tracking-wider mb-1">Placeholder</label>
                      <input
                        value={field.placeholder || ''}
                        onChange={(e) => updateField(index, { placeholder: e.target.value })}
                        placeholder="Placeholder text"
                        className="w-full px-2 py-1.5 bg-cream/10 border border-warm-gray/30 rounded text-xs text-cream outline-none"
                      />
                    </div>

                    {/* Required + Delete */}
                    <div className="col-span-3 flex items-end gap-3">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={field.required || false}
                          onChange={(e) => updateField(index, { required: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-[10px] text-warm-gray">Required</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => removeField(index)}
                        className="text-red-400 hover:text-red-300 text-xs transition-colors ml-auto"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  {/* Options for select fields */}
                  {field.type === 'select' && (
                    <div className="mt-3 pt-3 border-t border-warm-gray/20">
                      <label className="block text-[10px] text-warm-gray uppercase tracking-wider mb-1">
                        Options (one per line)
                      </label>
                      <textarea
                        value={(field.options || []).join('\n')}
                        onChange={(e) =>
                          updateField(index, {
                            options: e.target.value.split('\n').filter(Boolean),
                          })
                        }
                        rows={3}
                        placeholder={"Option 1\nOption 2\nOption 3"}
                        className="w-full px-2 py-1.5 bg-cream/10 border border-warm-gray/30 rounded text-xs text-cream outline-none resize-y"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Branding */}
        <div className="border border-warm-border rounded-xl p-6 space-y-6">
          <h3 className="text-sm font-semibold text-ink">Page Branding</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Page Heading</label>
              <input
                value={formData.heading}
                onChange={(e) => set('heading', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Subtext</label>
              <input
                value={formData.subtext}
                onChange={(e) => set('subtext', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className={labelClass}>Logo Text (Line 1)</label>
              <input
                value={formData.logo_text}
                onChange={(e) => set('logo_text', e.target.value)}
                placeholder="STURDY"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Logo Text (Line 2)</label>
              <input
                value={formData.logo_subtext}
                onChange={(e) => set('logo_subtext', e.target.value)}
                placeholder="HEALTH"
                className={inputClass}
              />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Primary Color</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={formData.primary_color}
                  onChange={(e) => set('primary_color', e.target.value)}
                  className="w-9 h-9 rounded border-0 cursor-pointer"
                />
                <input
                  value={formData.primary_color}
                  onChange={(e) => set('primary_color', e.target.value)}
                  className={`${inputClass} font-mono text-xs`}
                />
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass}>Logo Image URL (optional — overrides text logo)</label>
            <input
              value={formData.logo_url}
              onChange={(e) => set('logo_url', e.target.value)}
              placeholder="https://..."
              className={inputClass}
            />
          </div>
        </div>

        {/* Confirmation */}
        <div className="border border-warm-border rounded-xl p-6 space-y-6">
          <h3 className="text-sm font-semibold text-ink">Confirmation Message</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Heading</label>
              <input
                value={formData.confirmation_heading}
                onChange={(e) => set('confirmation_heading', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Message</label>
              <input
                value={formData.confirmation_message}
                onChange={(e) => set('confirmation_message', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.active}
              onChange={(e) => set('active', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-warm-gray">Active (publicly accessible)</span>
          </div>
        </div>

        {/* Public URL preview */}
        <div className="border border-warm-border rounded-xl p-6 bg-ink">
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">
            Public Form URL
          </div>
          <code className="text-xs text-cream font-mono">
            {process.env.NEXT_PUBLIC_APP_URL || 'https://revet.app'}/f/{formData.slug || '{slug}'}
          </code>
        </div>

        {/* Actions */}
        {error && <p className="text-red-600 text-xs">{error}</p>}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-ink hover:bg-ink/90 text-cream text-sm font-medium rounded-full transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : isEditing ? 'Update Form' : 'Create Form'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2.5 border border-warm-border text-warm-gray text-sm rounded-full hover:text-ink hover:border-ink transition-colors"
          >
            Cancel
          </button>
          {isEditing && (
            <button
              type="button"
              onClick={handleDelete}
              className="ml-auto px-4 py-2.5 text-red-600 text-xs hover:text-red-500 transition-colors"
            >
              Delete Form
            </button>
          )}
        </div>
      </div>
    </form>
  )
}
