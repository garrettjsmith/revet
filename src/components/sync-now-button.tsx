'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function SyncNowButton({ pendingCount }: { pendingCount: number }) {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const handleSync = async () => {
    setStatus('syncing')
    setMessage('')

    try {
      const res = await fetch('/api/google/reviews/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 50 }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setStatus('error')
        setMessage(data.error || `Failed (${res.status})`)
        return
      }

      const data = await res.json()
      setStatus('done')
      setMessage(`Synced ${data.synced || 0} source${data.synced === 1 ? '' : 's'}`)
      router.refresh()

      setTimeout(() => {
        setStatus('idle')
        setMessage('')
      }, 5000)
    } catch (err) {
      setStatus('error')
      setMessage('Network error')
    }
  }

  if (pendingCount === 0) return null

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span className={`text-xs ${status === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
          {message}
        </span>
      )}
      <button
        onClick={handleSync}
        disabled={status === 'syncing'}
        className="px-3 py-1 text-xs font-medium text-ink border border-warm-border rounded-full hover:bg-warm-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {status === 'syncing' ? 'Syncing...' : 'Sync now'}
      </button>
    </div>
  )
}
