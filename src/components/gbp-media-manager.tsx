'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { GBPMedia } from '@/lib/types'

const CATEGORIES = [
  'COVER', 'PROFILE', 'LOGO', 'EXTERIOR', 'INTERIOR', 'PRODUCT',
  'AT_WORK', 'FOOD_AND_DRINK', 'MENU', 'COMMON_AREA', 'ROOMS',
  'TEAMS', 'ADDITIONAL',
]

const CATEGORY_LABELS: Record<string, string> = {
  COVER: 'Cover', PROFILE: 'Profile', LOGO: 'Logo', EXTERIOR: 'Exterior',
  INTERIOR: 'Interior', PRODUCT: 'Product', AT_WORK: 'At Work',
  FOOD_AND_DRINK: 'Food & Drink', MENU: 'Menu', COMMON_AREA: 'Common Area',
  ROOMS: 'Rooms', TEAMS: 'Team', ADDITIONAL: 'Additional',
}

interface Props {
  mediaItems: GBPMedia[]
  locationId: string
  isAdmin: boolean
}

export function GBPMediaManager({ mediaItems, locationId, isAdmin }: Props) {
  const router = useRouter()
  const [filter, setFilter] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Upload form state
  const [sourceUrl, setSourceUrl] = useState('')
  const [category, setCategory] = useState('ADDITIONAL')
  const [description, setDescription] = useState('')

  const uniqueCategories = Array.from(new Set(mediaItems.map((m) => m.category).filter(Boolean))) as string[]
  const filtered = filter ? mediaItems.filter((m) => m.category === filter) : mediaItems

  const handleUpload = async () => {
    if (!sourceUrl.trim()) return
    setUploading(true)
    setError(null)
    try {
      const res = await fetch(`/api/locations/${locationId}/gbp-media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_url: sourceUrl, category, description: description || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setShowUpload(false)
      setSourceUrl('')
      setDescription('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
    setUploading(false)
  }

  const handleDelete = async (mediaId: string) => {
    if (!confirm('Delete this photo from Google Business Profile?')) return
    setDeleting(mediaId)
    setError(null)
    try {
      const res = await fetch(`/api/locations/${locationId}/gbp-media`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_id: mediaId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Delete failed')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
    setDeleting(null)
  }

  return (
    <div className="border border-warm-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-warm-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Photos ({mediaItems.length})</h2>
        {isAdmin && (
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="px-3 py-1 text-xs font-medium text-ink bg-warm-light border border-warm-border rounded-full hover:bg-warm-border/50 transition-colors"
          >
            {showUpload ? 'Cancel' : 'Upload Photo'}
          </button>
        )}
      </div>

      <div className="p-5 space-y-4">
        {error && (
          <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>
        )}

        {/* Upload form */}
        {showUpload && (
          <div className="border border-warm-border rounded-lg p-4 space-y-3">
            <div>
              <label className="text-[10px] text-warm-gray uppercase tracking-wider block mb-1">Image URL</label>
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://example.com/photo.jpg"
                className="w-full px-3 py-2 text-sm border border-warm-border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-ink/20"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] text-warm-gray uppercase tracking-wider block mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-warm-border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-ink/20"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{CATEGORY_LABELS[cat] || cat}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-warm-gray uppercase tracking-wider block mb-1">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2 text-sm border border-warm-border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-ink/20"
                />
              </div>
            </div>
            <button
              onClick={handleUpload}
              disabled={uploading || !sourceUrl.trim()}
              className="px-4 py-2 text-xs font-medium text-cream bg-ink rounded-full hover:bg-ink/90 transition-colors disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload to Google'}
            </button>
          </div>
        )}

        {/* Category filter pills */}
        {uniqueCategories.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setFilter(null)}
              className={`px-2.5 py-1 text-[10px] font-medium rounded-full transition-colors ${
                !filter ? 'bg-ink text-cream' : 'bg-warm-light text-warm-gray hover:text-ink'
              }`}
            >
              All
            </button>
            {uniqueCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat === filter ? null : cat)}
                className={`px-2.5 py-1 text-[10px] font-medium rounded-full transition-colors ${
                  filter === cat ? 'bg-ink text-cream' : 'bg-warm-light text-warm-gray hover:text-ink'
                }`}
              >
                {CATEGORY_LABELS[cat] || cat}
              </button>
            ))}
          </div>
        )}

        {/* Photo grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-6 gap-3">
            {filtered.map((m) => (
              <div key={m.id} className="group relative aspect-square rounded-lg overflow-hidden bg-warm-light border border-warm-border">
                {m.google_url ? (
                  <img
                    src={`${m.google_url}=s300`}
                    alt={m.description || ''}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-warm-gray">
                    No preview
                  </div>
                )}
                {/* Category overlay on hover */}
                {m.category && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[9px] text-white">{CATEGORY_LABELS[m.category] || m.category}</span>
                  </div>
                )}
                {/* Delete button for admins */}
                {isAdmin && (
                  <button
                    onClick={() => handleDelete(m.id)}
                    disabled={deleting === m.id}
                    className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 disabled:opacity-50"
                  >
                    {deleting === m.id ? '...' : 'x'}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-xs text-warm-gray">
            {filter ? 'No photos in this category' : 'No photos synced yet'}
          </div>
        )}
      </div>
    </div>
  )
}
