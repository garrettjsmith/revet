'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function RunAuditButtonClient({ locationId }: { locationId: string }) {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')

  async function handleRun() {
    setStatus('running')
    try {
      const res = await fetch('/api/citations/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_ids: [locationId] }),
      })
      if (!res.ok) {
        setStatus('error')
      } else {
        setStatus('done')
        router.refresh()
      }
    } catch {
      setStatus('error')
    }
    setTimeout(() => setStatus('idle'), 3000)
  }

  return (
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
      {status === 'running' ? 'Running...' : status === 'done' ? 'Audit Triggered' : status === 'error' ? 'Failed' : 'Run Audit'}
    </button>
  )
}
