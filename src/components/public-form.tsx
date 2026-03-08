'use client'

import { useState } from 'react'
import type { FormTemplate } from '@/lib/types'

export function PublicForm({ form }: { form: FormTemplate }) {
  const [step, setStep] = useState<'form' | 'submitting' | 'success'>('form')
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  const primary = form.primary_color

  const setValue = (fieldId: string, value: string) =>
    setValues((v) => ({ ...v, [fieldId]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStep('submitting')
    setError('')

    try {
      const res = await fetch('/api/form-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form_id: form.id,
          data: values,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Submission failed')
      }

      setStep('success')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setStep('form')
    }
  }

  return (
    <div className="min-h-screen bg-white relative">

      {/* Top accent bar */}
      <div className="h-1 relative z-10" style={{ background: primary }} />

      <div className="max-w-[520px] mx-auto px-6 pt-16 pb-20 relative z-10">

        {/* Logo */}
        <div className="mb-12 text-center">
          {form.logo_url ? (
            <img
              src={form.logo_url}
              alt={form.name}
              className="h-16 mx-auto object-contain"
            />
          ) : form.logo_text ? (
            <div
              className="inline-flex flex-col items-center px-8 py-4 rounded-xl text-white"
              style={{ background: primary }}
            >
              <div className="text-xl font-bold tracking-[0.15em] leading-tight">
                {form.logo_text}
              </div>
              {form.logo_subtext && (
                <div className="text-xs font-medium tracking-[0.25em] opacity-85 mt-0.5">
                  {form.logo_subtext}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Form step */}
        {step !== 'success' && (
          <div className="animate-[fadeUp_0.5s_ease]">
            <h1 className="text-3xl font-semibold text-gray-900 mb-3 leading-snug text-center text-balance">
              {form.heading}
            </h1>
            <p className="text-base text-gray-500 mb-10 leading-relaxed text-center">
              {form.subtext}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {form.fields.map((field) => (
                <div key={field.id}>
                  <label className="block text-sm font-medium text-gray-900 mb-1.5">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>

                  {field.type === 'textarea' ? (
                    <textarea
                      value={values[field.id] || ''}
                      onChange={(e) => setValue(field.id, e.target.value)}
                      placeholder={field.placeholder}
                      required={field.required}
                      rows={4}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900 transition-colors resize-y placeholder:text-gray-500"
                    />
                  ) : field.type === 'select' ? (
                    <select
                      value={values[field.id] || ''}
                      onChange={(e) => setValue(field.id, e.target.value)}
                      required={field.required}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900 transition-colors"
                    >
                      <option value="">{field.placeholder || 'Select...'}</option>
                      {(field.options || []).map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : field.type === 'checkbox' ? (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={values[field.id] === 'true'}
                        onChange={(e) => setValue(field.id, e.target.checked ? 'true' : 'false')}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-500">{field.placeholder || field.label}</span>
                    </label>
                  ) : (
                    <input
                      type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                      value={values[field.id] || ''}
                      onChange={(e) => setValue(field.id, e.target.value)}
                      placeholder={field.placeholder}
                      required={field.required}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900 transition-colors placeholder:text-gray-500"
                    />
                  )}
                </div>
              ))}

              {error && (
                <p className="text-red-600 text-sm">{error}</p>
              )}

              <button
                type="submit"
                disabled={step === 'submitting'}
                className="w-full py-3.5 text-white text-base font-medium rounded-full transition-all duration-200 disabled:opacity-50"
                style={{ background: primary }}
              >
                {step === 'submitting' ? 'Submitting...' : 'Submit'}
              </button>
            </form>
          </div>
        )}

        {/* Success step */}
        {step === 'success' && (
          <div className="animate-[fadeUp_0.4s_ease] text-center">
            <div className="text-gray-900 mb-5">
              <svg className="mx-auto" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-3">
              {form.confirmation_heading}
            </h2>
            <p className="text-base text-gray-500 leading-relaxed">
              {form.confirmation_message}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 text-center py-3 bg-gradient-to-t from-white via-white to-transparent relative z-10">
        <span className="text-[11px] text-gray-300">Powered by revet.app</span>
      </div>
    </div>
  )
}
