'use client'

import { useState, useEffect } from 'react'

interface AuditSection {
  key: string
  label: string
  score: number
  maxScore: number
  status: 'good' | 'warning' | 'poor'
  suggestion: string | null
}

interface AuditResult {
  score: number
  sections: AuditSection[]
}

interface Props {
  locationId: string
  isAgencyAdmin: boolean
}

export function ProfileAuditCard({ locationId, isAgencyAdmin }: Props) {
  const [audit, setAudit] = useState<AuditResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)
  const [aiSuggestion, setAiSuggestion] = useState<{ field: string; text: string } | null>(null)

  useEffect(() => {
    fetch(`/api/locations/${locationId}/gbp-profile/audit`, { method: 'POST' })
      .then((res) => res.json())
      .then((data) => {
        if (data.score !== undefined) setAudit(data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [locationId])

  const handleAiSuggest = async (field: string) => {
    setGenerating(field)
    setAiSuggestion(null)
    try {
      const res = await fetch(`/api/locations/${locationId}/gbp-profile/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field }),
      })
      const data = await res.json()
      if (field === 'description' && data.suggestion) {
        setAiSuggestion({ field, text: data.suggestion })
      } else if (field === 'categories' && data.suggestions) {
        setAiSuggestion({ field, text: data.suggestions.join('\n') })
      }
    } catch {
      // Silent fail
    }
    setGenerating(null)
  }

  if (loading) {
    return (
      <div className="border border-warm-border rounded-xl p-6">
        <div className="animate-pulse flex items-center gap-4">
          <div className="w-16 h-16 bg-warm-border rounded-full" />
          <div className="space-y-2 flex-1">
            <div className="h-4 w-32 bg-warm-border rounded" />
            <div className="h-3 w-48 bg-warm-border/50 rounded" />
          </div>
        </div>
      </div>
    )
  }

  if (!audit) return null

  const scoreColor = audit.score >= 80 ? 'text-emerald-600' : audit.score >= 50 ? 'text-amber-600' : 'text-red-500'
  const ringColor = audit.score >= 80 ? 'stroke-emerald-500' : audit.score >= 50 ? 'stroke-amber-500' : 'stroke-red-500'

  return (
    <div className="border border-warm-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-warm-border">
        <h2 className="text-sm font-semibold text-ink">Profile Optimization</h2>
      </div>
      <div className="p-5">
        {/* Score + sections */}
        <div className="flex items-start gap-6">
          {/* Score circle */}
          <div className="shrink-0 relative w-20 h-20">
            <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#D5CFC5"
                strokeWidth="2.5"
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                className={ringColor}
                strokeWidth="2.5"
                strokeDasharray={`${audit.score}, 100`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-xl font-bold font-mono ${scoreColor}`}>
                {audit.score}
              </span>
            </div>
          </div>

          {/* Section bars */}
          <div className="flex-1 space-y-2">
            {audit.sections.map((s) => (
              <div key={s.key} className="flex items-center gap-3">
                <span className="text-[10px] text-warm-gray w-16 shrink-0">{s.label}</span>
                <div className="flex-1 h-1.5 bg-warm-border/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      s.status === 'good' ? 'bg-emerald-500' :
                      s.status === 'warning' ? 'bg-amber-500' : 'bg-red-400'
                    }`}
                    style={{ width: `${(s.score / s.maxScore) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-warm-gray w-8 text-right">
                  {s.score}/{s.maxScore}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Suggestions */}
        {audit.sections.some((s) => s.suggestion) && (
          <div className="mt-5 pt-4 border-t border-warm-border space-y-3">
            <div className="text-[10px] text-warm-gray uppercase tracking-wider font-medium">
              Recommendations
            </div>
            {audit.sections
              .filter((s) => s.suggestion)
              .map((s) => (
                <div key={s.key} className="flex items-start gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                    s.status === 'warning' ? 'bg-amber-500' : 'bg-red-400'
                  }`} />
                  <div className="flex-1">
                    <p className="text-xs text-ink leading-relaxed">{s.suggestion}</p>
                    {isAgencyAdmin && (s.key === 'description' || s.key === 'categories') && (
                      <button
                        onClick={() => handleAiSuggest(s.key)}
                        disabled={generating === s.key}
                        className="mt-1 text-[10px] text-ink font-medium hover:text-ink/70 transition-colors disabled:opacity-50"
                      >
                        {generating === s.key ? 'Generating...' : 'AI Suggest'}
                      </button>
                    )}
                  </div>
                </div>
              ))}

            {/* AI Suggestion display */}
            {aiSuggestion && (
              <div className="bg-amber-50 rounded-lg p-3 border-l-2 border-amber-300">
                <div className="text-[10px] text-amber-600 uppercase tracking-wider mb-1 font-medium">
                  AI Suggestion — {aiSuggestion.field}
                </div>
                <p className="text-xs text-ink leading-relaxed whitespace-pre-wrap">
                  {aiSuggestion.text}
                </p>
                <p className="text-[10px] text-warm-gray mt-2">
                  Use the Edit Profile button above to apply this suggestion.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
