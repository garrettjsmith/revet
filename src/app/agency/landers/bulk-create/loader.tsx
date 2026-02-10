'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function BulkCreateLoader() {
  const router = useRouter()

  useEffect(() => {
    const stored = sessionStorage.getItem('bulk_lander_location_ids')
    if (stored) {
      try {
        const ids: string[] = JSON.parse(stored)
        sessionStorage.removeItem('bulk_lander_location_ids')
        if (ids.length > 0) {
          router.replace(`/agency/landers/bulk-create?ids=${ids.join(',')}`)
          return
        }
      } catch {
        // fall through
      }
    }

    // No IDs found, go back
    router.replace('/agency/locations')
  }, [router])

  return (
    <div className="p-8 text-center py-16">
      <div className="inline-block w-6 h-6 border-2 border-ink border-t-transparent rounded-full animate-spin mb-3" />
      <p className="text-sm text-warm-gray">Loading...</p>
    </div>
  )
}
