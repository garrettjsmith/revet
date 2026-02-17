'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { GBPPost, GBPPostQueue } from '@/lib/types'

const TOPIC_STYLES: Record<string, { label: string; classes: string }> = {
  STANDARD: { label: 'Update', classes: 'bg-warm-light text-warm-gray' },
  EVENT: { label: 'Event', classes: 'bg-blue-50 text-blue-600' },
  OFFER: { label: 'Offer', classes: 'bg-amber-50 text-amber-600' },
  ALERT: { label: 'Alert', classes: 'bg-red-50 text-red-600' },
}

const STATE_STYLES: Record<string, { color: string }> = {
  LIVE: { color: 'bg-emerald-500' },
  PROCESSING: { color: 'bg-amber-500' },
  REJECTED: { color: 'bg-red-500' },
}

const CTA_TYPES = [
  'BOOK', 'ORDER', 'SHOP', 'LEARN_MORE', 'SIGN_UP', 'CALL',
]

interface Props {
  posts: GBPPost[]
  queuedPosts: GBPPostQueue[]
  locationId: string
  isAdmin: boolean
}

export function GBPPostsSection({ posts, queuedPosts, locationId, isAdmin }: Props) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [topicType, setTopicType] = useState('STANDARD')
  const [summary, setSummary] = useState('')
  const [actionType, setActionType] = useState('')
  const [actionUrl, setActionUrl] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [eventTitle, setEventTitle] = useState('')
  const [eventStart, setEventStart] = useState('')
  const [eventEnd, setEventEnd] = useState('')
  const [offerCode, setOfferCode] = useState('')
  const [offerTerms, setOfferTerms] = useState('')
  const [scheduledFor, setScheduledFor] = useState('')

  const resetForm = () => {
    setTopicType('STANDARD')
    setSummary('')
    setActionType('')
    setActionUrl('')
    setMediaUrl('')
    setEventTitle('')
    setEventStart('')
    setEventEnd('')
    setOfferCode('')
    setOfferTerms('')
    setScheduledFor('')
  }

  const handleCreate = async () => {
    if (!summary.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch(`/api/locations/${locationId}/gbp-posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic_type: topicType,
          summary,
          action_type: actionType || undefined,
          action_url: actionUrl || undefined,
          media_url: mediaUrl || undefined,
          event_title: eventTitle || undefined,
          event_start: eventStart || undefined,
          event_end: eventEnd || undefined,
          offer_coupon_code: offerCode || undefined,
          offer_terms: offerTerms || undefined,
          scheduled_for: scheduledFor || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create post')
      setShowForm(false)
      resetForm()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post')
    }
    setCreating(false)
  }

  const handleDelete = async (postId: string) => {
    if (!confirm('Delete this post from Google Business Profile?')) return
    setDeleting(postId)
    setError(null)
    try {
      const res = await fetch(`/api/locations/${locationId}/gbp-posts`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete post')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete post')
    }
    setDeleting(null)
  }

  const totalCount = posts.length + queuedPosts.length

  return (
    <div className="border border-warm-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-warm-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Posts ({totalCount})</h2>
        {isAdmin && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-3 py-1 text-xs font-medium text-ink bg-warm-light border border-warm-border rounded-full hover:bg-warm-border/50 transition-colors"
          >
            {showForm ? 'Cancel' : 'New Post'}
          </button>
        )}
      </div>

      <div className="p-5 space-y-4">
        {error && (
          <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>
        )}

        {/* Creation form */}
        {showForm && (
          <div className="border border-warm-border rounded-lg p-4 space-y-3">
            <div>
              <label className="text-[10px] text-warm-gray uppercase tracking-wider block mb-1">Type</label>
              <div className="flex gap-1.5">
                {Object.entries(TOPIC_STYLES).map(([key, { label, classes }]) => (
                  <button
                    key={key}
                    onClick={() => setTopicType(key)}
                    className={`px-2.5 py-1 text-[10px] font-medium rounded-full transition-colors ${
                      topicType === key ? 'bg-ink text-cream' : classes
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] text-warm-gray uppercase tracking-wider block mb-1">Content</label>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={3}
                maxLength={1500}
                placeholder="Write your post..."
                className="w-full px-3 py-2 text-sm border border-warm-border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-ink/20 resize-none"
              />
              <div className="text-[10px] text-warm-gray text-right">{summary.length}/1500</div>
            </div>

            {/* CTA */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] text-warm-gray uppercase tracking-wider block mb-1">CTA Button</label>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-warm-border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-ink/20"
                >
                  <option value="">None</option>
                  {CTA_TYPES.map((t) => (
                    <option key={t} value={t}>{t.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              {actionType && (
                <div className="flex-1">
                  <label className="text-[10px] text-warm-gray uppercase tracking-wider block mb-1">CTA URL</label>
                  <input
                    type="url"
                    value={actionUrl}
                    onChange={(e) => setActionUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 text-sm border border-warm-border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-ink/20"
                  />
                </div>
              )}
            </div>

            {/* Media URL */}
            <div>
              <label className="text-[10px] text-warm-gray uppercase tracking-wider block mb-1">Image URL</label>
              <input
                type="url"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="https://example.com/image.jpg (optional)"
                className="w-full px-3 py-2 text-sm border border-warm-border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-ink/20"
              />
            </div>

            {/* Event fields */}
            {topicType === 'EVENT' && (
              <div className="space-y-3 border-t border-warm-border pt-3">
                <div>
                  <label className="text-[10px] text-warm-gray uppercase tracking-wider block mb-1">Event Title</label>
                  <input
                    type="text"
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-warm-border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-ink/20"
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] text-warm-gray uppercase tracking-wider block mb-1">Start</label>
                    <input
                      type="datetime-local"
                      value={eventStart}
                      onChange={(e) => setEventStart(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-warm-border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-ink/20"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-warm-gray uppercase tracking-wider block mb-1">End</label>
                    <input
                      type="datetime-local"
                      value={eventEnd}
                      onChange={(e) => setEventEnd(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-warm-border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-ink/20"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Offer fields */}
            {topicType === 'OFFER' && (
              <div className="space-y-3 border-t border-warm-border pt-3">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] text-warm-gray uppercase tracking-wider block mb-1">Coupon Code</label>
                    <input
                      type="text"
                      value={offerCode}
                      onChange={(e) => setOfferCode(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-warm-border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-ink/20"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-warm-gray uppercase tracking-wider block mb-1">Terms</label>
                    <input
                      type="text"
                      value={offerTerms}
                      onChange={(e) => setOfferTerms(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-warm-border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-ink/20"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Schedule */}
            <div>
              <label className="text-[10px] text-warm-gray uppercase tracking-wider block mb-1">Schedule</label>
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-warm-border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-ink/20"
              />
              <div className="text-[10px] text-warm-gray mt-1">Leave empty to post immediately</div>
            </div>

            <button
              onClick={handleCreate}
              disabled={creating || !summary.trim()}
              className="px-4 py-2 text-xs font-medium text-cream bg-ink rounded-full hover:bg-ink/90 transition-colors disabled:opacity-50"
            >
              {creating ? 'Posting...' : scheduledFor ? 'Schedule Post' : 'Post Now'}
            </button>
          </div>
        )}

        {/* Queued posts */}
        {queuedPosts.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] text-warm-gray uppercase tracking-wider font-medium">Scheduled</div>
            {queuedPosts.map((q) => (
              <div key={q.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-amber-50/50 border border-amber-200/50">
                <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-amber-100 text-amber-700">
                  {q.scheduled_for
                    ? new Date(q.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                    : 'Pending'}
                </span>
                <p className="text-xs text-ink flex-1 line-clamp-2">{q.summary}</p>
                {q.status === 'sending' && (
                  <span className="text-[10px] text-amber-600">Sending...</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Published posts */}
        {posts.length > 0 ? (
          <div className="space-y-2">
            {queuedPosts.length > 0 && (
              <div className="text-[10px] text-warm-gray uppercase tracking-wider font-medium">Published</div>
            )}
            {posts.map((post) => {
              const style = TOPIC_STYLES[post.topic_type] || TOPIC_STYLES.STANDARD
              const stateStyle = STATE_STYLES[post.state] || STATE_STYLES.LIVE
              return (
                <div key={post.id} className="group flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-warm-light/50 transition-colors">
                  <div className="flex items-center gap-2 shrink-0 mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${stateStyle.color}`} />
                    <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${style.classes}`}>
                      {style.label}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    {post.event_title && (
                      <div className="text-xs font-medium text-ink mb-0.5">{post.event_title}</div>
                    )}
                    <p className="text-xs text-ink line-clamp-2">{post.summary}</p>
                    {post.create_time && (
                      <span className="text-[10px] text-warm-gray">
                        {new Date(post.create_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(post.id)}
                      disabled={deleting === post.id}
                      className="text-[10px] text-warm-gray hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0 disabled:opacity-50"
                    >
                      {deleting === post.id ? '...' : 'Delete'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ) : queuedPosts.length === 0 ? (
          <div className="text-center py-8 text-xs text-warm-gray">
            No posts yet
          </div>
        ) : null}
      </div>
    </div>
  )
}
