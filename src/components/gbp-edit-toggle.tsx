'use client'

import { useState } from 'react'
import { GBPProfileEditor } from './gbp-profile-editor'
import type { GBPProfile } from '@/lib/types'

interface Props {
  profile: GBPProfile
  locationId: string
}

export function GBPEditToggle({ profile, locationId }: Props) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <GBPProfileEditor
        profile={profile}
        locationId={locationId}
        onClose={() => setEditing(false)}
      />
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="px-4 py-2 border border-warm-border text-warm-gray text-xs rounded-full hover:text-ink hover:border-ink transition-colors"
    >
      Edit Profile
    </button>
  )
}
