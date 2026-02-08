'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function SyncButton({
  endpoint,
  label,
}: {
  endpoint: string
  label: string
}) {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')

  async function handleSync() {
    setStatus('syncing')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        console.error('Sync failed:', data)
        setStatus('error')
      } else {
        setStatus('done')
        router.refresh()
      }
    } catch (err) {
      console.error('Sync failed:', err)
      setStatus('error')
    }
    setTimeout(() => setStatus('idle'), 3000)
  }

  return (
    <button
      onClick={handleSync}
      disabled={status === 'syncing'}
      className={`px-3 py-1.5 text-[11px] font-medium rounded-full border transition-colors ${
        status === 'syncing'
          ? 'border-warm-border text-warm-gray cursor-wait'
          : status === 'done'
          ? 'border-emerald-300 text-emerald-600'
          : status === 'error'
          ? 'border-red-300 text-red-600'
          : 'border-warm-border text-warm-gray hover:text-ink hover:border-ink'
      }`}
    >
      {status === 'syncing'
        ? 'Syncing...'
        : status === 'done'
        ? 'Synced!'
        : status === 'error'
        ? 'Failed'
        : label}
    </button>
  )
}
