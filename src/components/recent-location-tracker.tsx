'use client'

import { useEffect } from 'react'
import { addRecentLocation } from '@/lib/recent-locations'

interface Props {
  locationId: string
  locationName: string
  city: string | null
  state: string | null
  orgSlug: string
  orgName: string
}

export function RecentLocationTracker({ locationId, locationName, city, state, orgSlug, orgName }: Props) {
  useEffect(() => {
    addRecentLocation({
      id: locationId,
      name: locationName,
      city,
      state,
      orgSlug,
      orgName,
    })
  }, [locationId, locationName, city, state, orgSlug, orgName])

  return null
}
