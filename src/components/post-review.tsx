'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface PostForReview {
  id: string
  location_id: string
  topic_type: string
  summary: string
  media_url: string | null
  scheduled_for: string | null
  status: string
  created_at: string
  location_name: string
  business_name: string
  city: string | null
  state: string | null
}

export function PostReviewClient({
  posts: initialPosts,
  orgSlug,
}: {
  posts: PostForReview[]
  orgSlug: string
}) {
  const [posts, setPosts] = useState(initialPosts)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const router = useRouter()

  const handleApprove = async (postId: string) => {
    setActionLoading(postId)
    try {
      const res = await fetch(`/api/posts/${postId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'client_approve' }),
      })
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== postId))
      }
    } catch { /* ignore */ }
    setActionLoading(null)
  }

  const handleReject = async (postId: string) => {
    setActionLoading(`reject_${postId}`)
    try {
      const res = await fetch(`/api/posts/${postId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      })
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== postId))
      }
    } catch { /* ignore */ }
    setActionLoading(null)
  }

  const handleRequestEdit = async (postId: string) => {
    if (!editText.trim()) return
    setActionLoading(`edit_${postId}`)
    try {
      // Save the edit then reject so agency sees the feedback
      await fetch(`/api/posts/${postId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'edit', summary: editText.trim() }),
      })
      // Move back to draft for agency to review the edited version
      await fetch(`/api/posts/${postId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      })
      setPosts((prev) => prev.filter((p) => p.id !== postId))
      setEditingId(null)
    } catch { /* ignore */ }
    setActionLoading(null)
  }

  const handleApproveAll = async () => {
    setActionLoading('approve_all')
    for (const post of posts) {
      try {
        await fetch(`/api/posts/${post.id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'client_approve' }),
        })
      } catch { /* ignore */ }
    }
    setPosts([])
    setActionLoading(null)
    router.refresh()
  }

  if (posts.length === 0) {
    return (
      <div className="border border-warm-border rounded-xl p-12 text-center text-warm-gray text-sm">
        All posts reviewed. Thank you!
      </div>
    )
  }

  return (
    <div>
      {/* Approve all button for batches */}
      {posts.length > 1 && (
        <div className="flex items-center justify-between mb-6 p-4 bg-warm-light/50 rounded-xl border border-warm-border/50">
          <span className="text-sm text-ink">
            {posts.length} post{posts.length === 1 ? '' : 's'} pending review
          </span>
          <button
            onClick={handleApproveAll}
            disabled={actionLoading === 'approve_all'}
            className="px-5 py-2 bg-ink hover:bg-ink/90 text-cream text-xs font-medium rounded-full transition-colors disabled:opacity-50"
          >
            {actionLoading === 'approve_all' ? 'Approving...' : 'Approve All'}
          </button>
        </div>
      )}

      <div className="space-y-8">
        {posts.map((post) => (
          <div key={post.id}>
            {/* Location header */}
            <div className="text-xs text-warm-gray mb-3">
              {post.location_name}
              {post.scheduled_for && (
                <span> · Scheduled {new Date(post.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              )}
            </div>

            {/* Google Post Mockup */}
            <GooglePostMockup
              businessName={post.business_name}
              summary={post.summary}
              mediaUrl={post.media_url}
              city={post.city}
              state={post.state}
            />

            {/* Edit mode */}
            {editingId === post.id && (
              <div className="mt-3">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={3}
                  maxLength={300}
                  placeholder="Suggest changes..."
                  className="w-full px-4 py-3 border border-warm-border rounded-xl text-sm text-ink outline-none focus:ring-2 focus:ring-ink/20 resize-y placeholder:text-warm-gray"
                  autoFocus
                />
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => handleRequestEdit(post.id)}
                    disabled={!editText.trim() || actionLoading === `edit_${post.id}`}
                    className="px-4 py-2 bg-ink hover:bg-ink/90 text-cream text-xs font-medium rounded-full transition-colors disabled:opacity-50"
                  >
                    {actionLoading === `edit_${post.id}` ? 'Sending...' : 'Send Edit Request'}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-4 py-2 text-xs text-warm-gray hover:text-ink transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Actions */}
            {editingId !== post.id && (
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => handleApprove(post.id)}
                  disabled={actionLoading === post.id}
                  className="px-5 py-2 bg-ink hover:bg-ink/90 text-cream text-xs font-medium rounded-full transition-colors disabled:opacity-50"
                >
                  {actionLoading === post.id ? 'Approving...' : 'Approve'}
                </button>
                <button
                  onClick={() => { setEditingId(post.id); setEditText(post.summary) }}
                  className="px-4 py-2 border border-warm-border text-xs text-ink rounded-full hover:border-ink transition-colors"
                >
                  Request Edit
                </button>
                <button
                  onClick={() => handleReject(post.id)}
                  disabled={actionLoading === `reject_${post.id}`}
                  className="px-4 py-2 text-xs text-warm-gray hover:text-red-600 transition-colors disabled:opacity-50"
                >
                  {actionLoading === `reject_${post.id}` ? 'Rejecting...' : 'Reject'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Google Business Profile post mockup.
 * Renders a realistic preview of how the post will appear on Google.
 */
function GooglePostMockup({
  businessName,
  summary,
  mediaUrl,
  city,
  state,
}: {
  businessName: string
  summary: string
  mediaUrl: string | null
  city: string | null
  state: string | null
}) {
  const initials = businessName.slice(0, 1).toUpperCase()
  const location = [city, state].filter(Boolean).join(', ')

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm max-w-md">
      {/* Header — business avatar + name */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900 truncate">{businessName}</div>
          {location && (
            <div className="text-xs text-gray-500">{location}</div>
          )}
        </div>
      </div>

      {/* Image */}
      {mediaUrl && (
        <div className="w-full">
          <img
            src={mediaUrl}
            alt=""
            className="w-full object-cover"
            style={{ aspectRatio: '4/3' }}
          />
        </div>
      )}

      {/* Post body */}
      <div className="px-4 py-3">
        <p className="text-sm text-gray-900 leading-relaxed">{summary}</p>
      </div>

      {/* Footer — Google branding hint */}
      <div className="px-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button className="text-xs text-blue-600 font-medium hover:underline">Learn more</button>
        </div>
        <div className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
          </svg>
          <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
        </div>
      </div>
    </div>
  )
}
