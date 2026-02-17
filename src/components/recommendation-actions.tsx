'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  recommendationId: string
  locationId: string
  isAdmin: boolean
}

export function RecommendationActions({ recommendationId, locationId, isAdmin }: Props) {
  const router = useRouter()
  const [acting, setActing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleAction = async (action: string) => {
    setActing(action)
    setError(null)

    const res = await fetch(`/api/locations/${locationId}/recommendations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, recommendation_id: recommendationId }),
    })

    if (res.ok) {
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Something went wrong')
    }
    setActing(null)
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => handleAction('client_approve')}
          disabled={acting !== null}
          className="px-5 py-2 bg-ink hover:bg-ink/90 text-cream text-sm font-medium rounded-full transition-colors disabled:opacity-50"
        >
          {acting === 'client_approve' ? 'Applying...' : 'Approve'}
        </button>
        <button
          onClick={() => handleAction('client_reject')}
          disabled={acting !== null}
          className="px-4 py-2 border border-warm-border text-warm-gray text-sm rounded-full hover:text-ink hover:border-ink transition-colors disabled:opacity-50"
        >
          {acting === 'client_reject' ? 'Declining...' : 'Decline'}
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-600 mt-2">{error}</p>
      )}
    </div>
  )
}
