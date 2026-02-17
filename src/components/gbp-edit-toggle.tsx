'use client'

export function GBPEditToggle({ onEdit }: { onEdit: () => void }) {
  return (
    <button
      onClick={onEdit}
      className="px-4 py-2 border border-warm-border text-warm-gray text-xs rounded-full hover:text-ink hover:border-ink transition-colors"
    >
      Edit Profile
    </button>
  )
}
