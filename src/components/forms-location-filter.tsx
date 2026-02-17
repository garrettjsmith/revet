'use client'

import { useRouter } from 'next/navigation'

interface Props {
  locations: { id: string; name: string }[]
  currentLocation: string | null
  orgSlug: string
}

export function FormsLocationFilter({ locations, currentLocation, orgSlug }: Props) {
  const router = useRouter()

  return (
    <select
      value={currentLocation || ''}
      onChange={(e) => {
        const val = e.target.value
        if (val) {
          router.push(`/admin/${orgSlug}/forms?location=${val}`)
        } else {
          router.push(`/admin/${orgSlug}/forms`)
        }
      }}
      className="text-xs bg-transparent border border-warm-border rounded-full px-3 py-1.5 outline-none text-warm-gray hover:text-ink transition-colors"
    >
      <option value="">All locations</option>
      {locations.map((l) => (
        <option key={l.id} value={l.id}>{l.name}</option>
      ))}
    </select>
  )
}
