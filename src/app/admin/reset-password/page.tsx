'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // Supabase client auto-reads the hash fragment and sets the session.
    // Listen for PASSWORD_RECOVERY event to confirm we have a valid recovery session.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })

    // Also check if the hash contains a recovery token (fallback)
    const hash = window.location.hash
    if (hash.includes('type=recovery')) {
      setReady(true)
    }

    return () => subscription.unsubscribe()
  }, [supabase.auth])

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(true)
      setTimeout(() => {
        router.push('/admin')
        router.refresh()
      }, 2000)
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4 relative">
        <div className="absolute inset-0 blueprint-grid pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="text-sm text-warm-gray">Verifying recovery link...</div>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4 relative">
        <div className="absolute inset-0 blueprint-grid pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="text-sm font-medium text-ink">Password updated</div>
          <div className="text-xs text-warm-gray mt-1">Redirecting to admin...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4 relative">
      <div className="absolute inset-0 blueprint-grid pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-lg bg-ink flex items-center justify-center font-bold text-xs text-cream font-mono">
              R
            </div>
            <span className="text-xl font-serif text-ink tracking-tight">revet.app</span>
          </div>
          <p className="text-warm-gray text-sm">Set a new password</p>
        </div>

        <form onSubmit={handleReset} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              required
              minLength={8}
              className="w-full px-4 py-3 bg-ink border border-ink rounded-lg text-cream text-sm outline-none focus:ring-2 focus:ring-warm-gray transition-colors placeholder:text-warm-gray"
            />
          </div>
          <div>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              required
              minLength={8}
              className="w-full px-4 py-3 bg-ink border border-ink rounded-lg text-cream text-sm outline-none focus:ring-2 focus:ring-warm-gray transition-colors placeholder:text-warm-gray"
            />
          </div>
          {error && (
            <p className="text-red-600 text-xs">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-ink hover:bg-ink/90 text-cream font-medium rounded-full text-sm transition-colors disabled:opacity-50"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
