'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function RunAuditButtonClient({ locationId }: { locationId: string }) {
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
        body: JSON.stringify({ location_ids: [locationId] }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStatus('error')
        setMessage(data.error || `Failed (${res.status})`)
      } else {
        setStatus('done')
        setMessage(`${data.triggered} audit${data.triggered === 1 ? '' : 's'} triggered`)
        router.refresh()
      }
    } catch (err) {
      setStatus('error')
      setMessage('Network error')
    }
    setTimeout(() => { setStatus('idle'); setMessage('') }, 5000)
  }

  return (
    <div className="flex items-center gap-2">
      {message && (
        <span className={`text-xs max-w-xs truncate ${status === 'error' ? 'text-red-500' : 'text-emerald-600'}`}>
          {message}
        </span>
      )}
      <button
        onClick={handleRun}
        disabled={status === 'running'}
        className={`px-4 py-2 text-xs font-medium rounded-full transition-colors disabled:opacity-50 ${
          status === 'done'
            ? 'border border-emerald-300 text-emerald-700'
            : status === 'error'
              ? 'border border-red-300 text-red-700'
              : 'border border-warm-border text-ink hover:border-ink'
        }`}
      >
        {status === 'running' ? 'Running...' : status === 'error' ? 'Failed' : status === 'done' ? 'Done' : 'Run Audit'}
      </button>
    </div>
  )
}
