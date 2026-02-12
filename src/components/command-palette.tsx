'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Command } from 'cmdk'
import { useRouter } from 'next/navigation'
import { getRecentLocations, type RecentLocation } from '@/lib/recent-locations'

interface SearchResult {
  locations: Array<{
    id: string
    name: string
    city: string | null
    state: string | null
    orgSlug: string
    orgName: string
  }>
  organizations: Array<{
    id: string
    name: string
    slug: string
  }>
  actions: Array<{
    id: string
    label: string
    path: string
    description: string
  }>
}

interface AIResponse {
  intent: string
  params: Record<string, unknown>
  confirmation: string
  requires_confirm: boolean
  result?: unknown
}

type AIState = 'idle' | 'ai_thinking' | 'ai_confirm' | 'ai_executing' | 'ai_done' | 'ai_error'

interface CommandPaletteProps {
  isAgencyAdmin?: boolean
}

export function CommandPalette({ isAgencyAdmin }: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult | null>(null)
  const [recents, setRecents] = useState<RecentLocation[]>([])
  const [loading, setLoading] = useState(false)
  const [aiState, setAiState] = useState<AIState>('idle')
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const router = useRouter()
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Global keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Load recents when opening
  useEffect(() => {
    if (open) {
      setRecents(getRecentLocations())
      setQuery('')
      setResults(null)
      setAiState('idle')
      setAiResponse(null)
      setAiError(null)
    }
  }, [open])

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!query || query.length < 2) {
      setResults(null)
      setLoading(false)
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/command/search?q=${encodeURIComponent(query)}`)
        if (res.ok) {
          setResults(await res.json())
        }
      } catch {
        // ignore fetch errors
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const navigate = useCallback(
    (path: string) => {
      setOpen(false)
      router.push(path)
    },
    [router]
  )

  // AI intent parsing
  const askAI = useCallback(async () => {
    if (!query.trim()) return
    setAiState('ai_thinking')
    setAiError(null)

    try {
      const res = await fetch('/api/command/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'AI request failed')
      }

      const data: AIResponse = await res.json()
      setAiResponse(data)

      if (data.requires_confirm) {
        setAiState('ai_confirm')
      } else {
        // Auto-execute non-mutating actions
        await executeAI(data)
      }
    } catch (e: any) {
      setAiError(e.message || 'Something went wrong')
      setAiState('ai_error')
    }
  }, [query])

  // AI command execution
  const executeAI = useCallback(
    async (response: AIResponse) => {
      setAiState('ai_executing')

      // Navigation: just navigate directly
      if (response.intent === 'navigate' && response.params.path) {
        setOpen(false)
        router.push(response.params.path as string)
        return
      }

      try {
        const res = await fetch('/api/command/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ intent: response.intent, params: response.params }),
        })

        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Execution failed')
        }

        const result = await res.json()
        setAiResponse({ ...response, result })
        setAiState('ai_done')
      } catch (e: any) {
        setAiError(e.message || 'Execution failed')
        setAiState('ai_error')
      }
    },
    [router]
  )

  const hasResults = results && (results.locations.length > 0 || results.organizations.length > 0 || results.actions.length > 0)
  const showRecents = !query && recents.length > 0

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="fixed inset-0 z-50"
      filter={() => 1}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-ink/40" onClick={() => setOpen(false)} />

      {/* Dialog */}
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg">
        <div className="bg-cream border border-warm-border rounded-xl shadow-2xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center border-b border-warm-border px-4">
            <SearchIcon className="w-4 h-4 text-warm-gray shrink-0" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder={isAgencyAdmin ? 'Search locations, orgs, actions... or ask AI' : 'Search locations, orgs...'}
              className="flex-1 bg-transparent border-0 outline-none text-sm text-ink placeholder:text-warm-gray py-3.5 px-3"
            />
            {loading && <LoadingSpinner />}
            <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] text-warm-gray bg-warm-light rounded px-1.5 py-0.5 font-mono">
              esc
            </kbd>
          </div>

          {/* AI states */}
          {aiState === 'ai_thinking' && (
            <div className="px-4 py-6 text-center">
              <LoadingSpinner />
              <p className="text-sm text-warm-gray mt-2">Thinking...</p>
            </div>
          )}

          {aiState === 'ai_confirm' && aiResponse ? (
            <div className="px-4 py-4">
              <p className="text-sm text-ink mb-3">{aiResponse.confirmation}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => executeAI(aiResponse)}
                  className="px-4 py-1.5 bg-ink text-cream text-sm rounded-full hover:bg-ink/90 transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={() => { setAiState('idle'); setAiResponse(null) }}
                  className="px-4 py-1.5 text-sm text-warm-gray hover:text-ink transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {aiState === 'ai_executing' && (
            <div className="px-4 py-6 text-center">
              <LoadingSpinner />
              <p className="text-sm text-warm-gray mt-2">Executing...</p>
            </div>
          )}

          {aiState === 'ai_done' && aiResponse?.result ? (
            <div className="px-4 py-4">
              <AIResults result={aiResponse.result} onNavigate={navigate} />
              <button
                onClick={() => { setAiState('idle'); setAiResponse(null); setQuery('') }}
                className="mt-3 text-xs text-warm-gray hover:text-ink transition-colors"
              >
                Done
              </button>
            </div>
          ) : null}

          {aiState === 'ai_error' && (
            <div className="px-4 py-4">
              <p className="text-sm text-red-600">{aiError}</p>
              <button
                onClick={() => { setAiState('idle'); setAiError(null) }}
                className="mt-2 text-xs text-warm-gray hover:text-ink transition-colors"
              >
                Try again
              </button>
            </div>
          )}

          {/* Search results */}
          {aiState === 'idle' && (
            <Command.List className="max-h-80 overflow-y-auto py-2">
              <Command.Empty className="py-6 text-center text-sm text-warm-gray">
                {query.length >= 2 ? 'No results found.' : 'Start typing to search...'}
              </Command.Empty>

              {/* Recent locations */}
              {showRecents && (
                <Command.Group heading="Recent">
                  {recents.map((loc) => (
                    <Command.Item
                      key={`recent-${loc.id}`}
                      value={`recent ${loc.name} ${loc.city || ''}`}
                      onSelect={() => navigate(`/admin/${loc.orgSlug}/locations/${loc.id}`)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer data-[selected=true]:bg-warm-light transition-colors"
                    >
                      <ClockIcon className="w-4 h-4 text-warm-gray shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-ink truncate">{loc.name}</div>
                        <div className="text-xs text-warm-gray truncate">
                          {[loc.city, loc.state].filter(Boolean).join(', ')}
                          {loc.orgName ? ` · ${loc.orgName}` : ''}
                        </div>
                      </div>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {/* Locations */}
              {results && results.locations.length > 0 && (
                <Command.Group heading="Locations">
                  {results.locations.map((loc) => (
                    <Command.Item
                      key={`loc-${loc.id}`}
                      value={`location ${loc.name} ${loc.city || ''} ${loc.orgName || ''}`}
                      onSelect={() => navigate(`/admin/${loc.orgSlug}/locations/${loc.id}`)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer data-[selected=true]:bg-warm-light transition-colors"
                    >
                      <LocationIcon className="w-4 h-4 text-warm-gray shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-ink truncate">{loc.name}</div>
                        <div className="text-xs text-warm-gray truncate">
                          {[loc.city, loc.state].filter(Boolean).join(', ')}
                          {loc.orgName ? ` · ${loc.orgName}` : ''}
                        </div>
                      </div>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {/* Organizations */}
              {results && results.organizations.length > 0 && (
                <Command.Group heading="Organizations">
                  {results.organizations.map((org) => (
                    <Command.Item
                      key={`org-${org.id}`}
                      value={`org ${org.name}`}
                      onSelect={() => navigate(`/admin/${org.slug}`)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer data-[selected=true]:bg-warm-light transition-colors"
                    >
                      <BuildingIcon className="w-4 h-4 text-warm-gray shrink-0" />
                      <div className="text-ink truncate">{org.name}</div>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {/* Actions */}
              {results && results.actions.length > 0 && (
                <Command.Group heading="Actions">
                  {results.actions.map((action) => (
                    <Command.Item
                      key={`action-${action.id}`}
                      value={`action ${action.label} ${action.description}`}
                      onSelect={() => navigate(action.path)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer data-[selected=true]:bg-warm-light transition-colors"
                    >
                      <BoltIcon className="w-4 h-4 text-warm-gray shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-ink truncate">{action.label}</div>
                        <div className="text-xs text-warm-gray truncate">{action.description}</div>
                      </div>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {/* Ask AI option */}
              {isAgencyAdmin && query.length >= 3 && (
                <Command.Group heading="AI">
                  <Command.Item
                    value={`ai ${query}`}
                    onSelect={askAI}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer data-[selected=true]:bg-warm-light transition-colors"
                  >
                    <SparkleIcon className="w-4 h-4 text-warm-gray shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-ink truncate">Ask AI: &quot;{query}&quot;</div>
                      <div className="text-xs text-warm-gray">Search, navigate, or perform actions with natural language</div>
                    </div>
                  </Command.Item>
                </Command.Group>
              )}
            </Command.List>
          )}

          {/* Footer */}
          <div className="border-t border-warm-border px-4 py-2 flex items-center gap-4 text-[10px] text-warm-gray">
            <span className="flex items-center gap-1">
              <kbd className="bg-warm-light rounded px-1 py-0.5 font-mono">↑↓</kbd> navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-warm-light rounded px-1 py-0.5 font-mono">↵</kbd> select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-warm-light rounded px-1 py-0.5 font-mono">esc</kbd> close
            </span>
          </div>
        </div>
      </div>
    </Command.Dialog>
  )
}

// AI result renderer
function AIResults({ result, onNavigate }: { result: unknown; onNavigate: (path: string) => void }) {
  const data = result as Record<string, unknown>

  // Location search results
  if (data.locations && Array.isArray(data.locations)) {
    return (
      <div>
        <p className="text-xs text-warm-gray mb-2">Found {data.locations.length} location{data.locations.length === 1 ? '' : 's'}:</p>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {data.locations.map((loc: any) => (
            <button
              key={loc.id}
              onClick={() => onNavigate(`/admin/${loc.orgSlug}/locations/${loc.id}`)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-left rounded hover:bg-warm-light transition-colors"
            >
              <LocationIcon className="w-3.5 h-3.5 text-warm-gray shrink-0" />
              <span className="text-ink truncate">{loc.name}</span>
              <span className="text-xs text-warm-gray truncate">{[loc.city, loc.state].filter(Boolean).join(', ')}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Generic message
  if (data.message) {
    return <p className="text-sm text-ink">{data.message as string}</p>
  }

  // Execution success
  if (data.updated !== undefined) {
    return <p className="text-sm text-emerald-600">Updated {data.updated as number} location{(data.updated as number) === 1 ? '' : 's'}</p>
  }

  return <p className="text-sm text-ink">Done.</p>
}

// Icons
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

function LocationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="1" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01" />
    </svg>
  )
}

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
    </svg>
  )
}

function LoadingSpinner() {
  return (
    <div className="w-4 h-4 border-2 border-warm-border border-t-warm-gray rounded-full animate-spin shrink-0" />
  )
}
