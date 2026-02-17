'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function GenerateAIContentCard({
  landerId,
  generatedAt,
  hasContent,
}: {
  landerId: string
  generatedAt: string | null
  hasContent: boolean
}) {
  const router = useRouter()
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const handleGenerate = async () => {
    setGenerating(true)
    setError('')

    try {
      const res = await fetch('/api/landers/ai-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lander_id: landerId }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Generation failed')
      }

      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="border border-warm-border rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">AI Content</div>
          {hasContent && generatedAt ? (
            <span className="text-sm text-ink">
              Generated{' '}
              {new Date(generatedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          ) : (
            <span className="text-sm text-warm-gray">Not generated yet</span>
          )}
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-4 py-1.5 bg-ink hover:bg-ink/90 text-cream text-xs font-medium rounded-full transition-colors disabled:opacity-50"
        >
          {generating ? 'Generating...' : hasContent ? 'Regenerate' : 'Generate'}
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-600 mt-2">{error}</p>
      )}
    </div>
  )
}
