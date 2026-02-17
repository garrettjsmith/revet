'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function RunAllAuditsButton() {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleRun() {
    setStatus('running')
    setMessage('')
    try {
      const res = await fetch('/api/citations/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) {
        setStatus('error')
        const detail = data.errors?.length ? data.errors.join('; ') : ''
        setMessage(detail || data.error || `Failed (${res.status})`)
      } else {
        setStatus('done')
        setMessage(`${data.triggered} audit${data.triggered === 1 ? '' : 's'} triggered`)
        router.refresh()
      }
    } catch {
      setStatus('error')
      setMessage('Network error')
    }
    setTimeout(() => { setStatus('idle'); setMessage('') }, 5000)
  }

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span className={`text-xs ${status === 'error' ? 'text-red-500' : 'text-emerald-600'}`}>
          {message}
        </span>
      )}
      <button
        onClick={handleRun}
        disabled={status === 'running'}
        className="px-5 py-2.5 bg-ink hover:bg-ink/90 text-cream text-xs font-medium rounded-full transition-colors disabled:opacity-50"
      >
        {status === 'running' ? 'Triggering...' : 'Run All Audits'}
      </button>
    </div>
  )
}
