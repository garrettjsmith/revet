'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function DisconnectButton({ provider }: { provider: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      const res = await fetch(`/api/integrations/${provider}/disconnect`, {
        method: 'POST',
      })
      if (res.ok) {
        router.refresh()
      } else {
        console.error('Disconnect failed:', await res.text())
      }
    } catch (err) {
      console.error('Disconnect failed:', err)
    } finally {
      setDisconnecting(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="px-3 py-1.5 border border-red-300 text-red-600 text-[11px] font-medium rounded-full hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {disconnecting ? 'Disconnecting...' : 'Confirm'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-3 py-1.5 text-[11px] text-warm-gray hover:text-ink transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="px-4 py-2 border border-warm-border text-warm-gray text-xs rounded-full hover:text-red-600 hover:border-red-300 transition-colors"
    >
      Disconnect
    </button>
  )
}
