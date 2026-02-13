'use client'

import { useState, useEffect } from 'react'

interface Topic {
  id: string
  topic: string
  source: 'ai' | 'manual'
  used_at: string | null
  use_count: number
  created_at: string
}

export function TopicPool({ locationId }: { locationId: string }) {
  const [topics, setTopics] = useState<Topic[]>([])
  const [available, setAvailable] = useState(0)
  const [used, setUsed] = useState(0)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [manualTopic, setManualTopic] = useState('')
  const [addingManual, setAddingManual] = useState(false)
  const [showUsed, setShowUsed] = useState(false)

  const fetchTopics = async () => {
    try {
      const res = await fetch(`/api/locations/${locationId}/topics`)
      if (res.ok) {
        const data = await res.json()
        setTopics(data.topics || [])
        setAvailable(data.available || 0)
        setUsed(data.used || 0)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { fetchTopics() }, [locationId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await fetch(`/api/locations/${locationId}/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', count: 50 }),
      })
      if (res.ok) {
        await fetchTopics()
      }
    } catch { /* ignore */ }
    setGenerating(false)
  }

  const handleAddManual = async () => {
    if (!manualTopic.trim()) return
    setAddingManual(true)
    try {
      const res = await fetch(`/api/locations/${locationId}/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_manual', topic: manualTopic.trim() }),
      })
      if (res.ok) {
        setManualTopic('')
        await fetchTopics()
      }
    } catch { /* ignore */ }
    setAddingManual(false)
  }

  const handleRemove = async (topicId: string) => {
    try {
      await fetch(`/api/locations/${locationId}/topics`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic_id: topicId }),
      })
      setTopics((prev) => prev.filter((t) => t.id !== topicId))
      setAvailable((prev) => prev - 1)
    } catch { /* ignore */ }
  }

  const availableTopics = topics.filter((t) => !t.used_at)
  const usedTopics = topics.filter((t) => t.used_at)

  if (loading) {
    return <div className="text-sm text-warm-gray animate-pulse">Loading topics...</div>
  }

  return (
    <div>
      {/* Stats */}
      <div className="flex items-center gap-4 mb-4">
        <div className="text-sm text-ink">
          <span className="font-medium">{available}</span> <span className="text-warm-gray">available</span>
        </div>
        <div className="text-sm text-ink">
          <span className="font-medium">{used}</span> <span className="text-warm-gray">used</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-4 py-2 bg-ink hover:bg-ink/90 text-cream text-xs font-medium rounded-full transition-colors disabled:opacity-50"
        >
          {generating ? 'Generating...' : 'Generate 50 Topics'}
        </button>

        <div className="flex items-center gap-1.5 flex-1 max-w-xs">
          <input
            type="text"
            value={manualTopic}
            onChange={(e) => setManualTopic(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddManual() }}
            placeholder="Add topic manually..."
            className="flex-1 px-3 py-2 border border-warm-border rounded-lg text-xs text-ink outline-none focus:ring-2 focus:ring-ink/20 placeholder:text-warm-gray"
          />
          <button
            onClick={handleAddManual}
            disabled={addingManual || !manualTopic.trim()}
            className="px-3 py-2 border border-warm-border text-xs text-ink rounded-lg hover:border-ink transition-colors disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      {/* Available topics */}
      {availableTopics.length > 0 && (
        <div className="mb-6">
          <div className="text-xs text-warm-gray uppercase tracking-wider font-medium mb-2">
            Available ({availableTopics.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {availableTopics.map((topic) => (
              <span
                key={topic.id}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-warm-light rounded-full text-xs text-ink border border-warm-border/50 group"
              >
                {topic.source === 'manual' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                )}
                {topic.topic}
                <button
                  onClick={() => handleRemove(topic.id)}
                  className="ml-0.5 text-warm-gray hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove"
                >
                  x
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Used topics (toggleable) */}
      {usedTopics.length > 0 && (
        <div>
          <button
            onClick={() => setShowUsed(!showUsed)}
            className="text-xs text-warm-gray hover:text-ink transition-colors mb-2"
          >
            {showUsed ? 'Hide' : 'Show'} used topics ({usedTopics.length})
          </button>
          {showUsed && (
            <div className="flex flex-wrap gap-1.5">
              {usedTopics.map((topic) => (
                <span
                  key={topic.id}
                  className="px-2.5 py-1 bg-warm-light/50 rounded-full text-xs text-warm-gray border border-warm-border/30 line-through"
                >
                  {topic.topic}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {topics.length === 0 && (
        <div className="text-center py-8 text-sm text-warm-gray">
          No topics yet. Generate a pool or add topics manually.
        </div>
      )}
    </div>
  )
}
