'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { useChatPane } from './chat-context'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatPaneProps {
  orgSlug?: string
  orgName?: string
  locationId?: string
  locationName?: string
  isAgencyAdmin?: boolean
}

// Friendly labels for tool activity indicators
const TOOL_LABELS: Record<string, string> = {
  get_reviews: 'Checking reviews',
  get_review_stats: 'Analyzing review trends',
  get_locations: 'Looking up locations',
  get_location_details: 'Fetching location details',
  get_performance_metrics: 'Pulling performance data',
  get_profile_audit: 'Checking audit scores',
  get_posts: 'Loading posts',
  get_org_overview: 'Getting org overview',
  get_review_sources: 'Checking review sources',
  get_landers: 'Loading landers',
  search_all_locations: 'Searching all locations',
  get_action_items: 'Finding action items',
  draft_review_reply: 'Drafting reply',
  send_review_reply: 'Sending reply',
  generate_post_draft: 'Generating post',
  schedule_post: 'Scheduling post',
  run_profile_audit: 'Running audit',
  update_gbp_field: 'Updating profile',
  generate_optimization_plan: 'Generating optimization plan',
}

export function ChatPane({ orgSlug, orgName, locationId, locationName, isAgencyAdmin }: ChatPaneProps) {
  const { isOpen, conversationId, close, setConversationId, startNewConversation } = useChatPane()
  const pathname = usePathname()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Auto-scroll to bottom on new messages or tool activity
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activeTool])

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [isOpen])

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        close()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, close])

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return

    const userMessage: ChatMessage = { role: 'user', content: trimmed }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')

    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = 'auto'

    setIsStreaming(true)
    setActiveTool(null)

    // Add empty assistant message for streaming into
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          context: { orgSlug, orgName, locationId, locationName, pathname, isAgencyAdmin },
          conversationId,
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: err.error || 'Something went wrong.' }
          return updated
        })
        setIsStreaming(false)
        return
      }

      const reader = res.body?.getReader()
      if (!reader) {
        setIsStreaming(false)
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE events
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              switch (parsed.type) {
                case 'delta':
                  if (parsed.text) {
                    setMessages((prev) => {
                      const updated = [...prev]
                      const last = updated[updated.length - 1]
                      updated[updated.length - 1] = { ...last, content: last.content + parsed.text }
                      return updated
                    })
                  }
                  break
                case 'tool_start':
                  setActiveTool(parsed.tool)
                  break
                case 'tool_done':
                  setActiveTool(null)
                  break
                case 'meta':
                  if (parsed.conversationId) {
                    setConversationId(parsed.conversationId)
                  }
                  break
                case 'error':
                  setMessages((prev) => {
                    const updated = [...prev]
                    updated[updated.length - 1] = { role: 'assistant', content: parsed.text || 'Something went wrong.' }
                    return updated
                  })
                  break
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') {
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: 'Connection lost. Please try again.' }
          return updated
        })
      }
    } finally {
      setIsStreaming(false)
      setActiveTool(null)
      abortRef.current = null
    }
  }, [input, messages, isStreaming, orgSlug, orgName, locationId, locationName, pathname, isAgencyAdmin, conversationId, setConversationId])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleClear = () => {
    if (abortRef.current) abortRef.current.abort()
    setMessages([])
    setInput('')
    setIsStreaming(false)
    setActiveTool(null)
    startNewConversation()
  }

  const chatContent = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-warm-border shrink-0">
        <div className="flex items-center gap-2">
          <SparkleIcon className="w-4 h-4 text-warm-gray" />
          <span className="text-sm font-medium text-ink">Ask Rev</span>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="text-xs text-warm-gray hover:text-ink transition-colors"
            >
              New chat
            </button>
          )}
          <button
            onClick={close}
            className="p-1 rounded hover:bg-warm-light transition-colors"
          >
            <CloseIcon className="w-4 h-4 text-warm-gray" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <SparkleIcon className="w-8 h-8 text-warm-border mb-3" />
            <p className="text-sm text-warm-gray">
              Ask about your reviews, locations, performance, or anything on screen.
            </p>
            <div className="mt-4 space-y-1.5 w-full">
              {[
                'How are my reviews trending?',
                'Which location needs attention?',
                'Summarize this week',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion)
                    setTimeout(() => inputRef.current?.focus(), 0)
                  }}
                  className="block w-full text-left text-xs text-warm-gray hover:text-ink px-3 py-1.5 rounded-lg hover:bg-warm-light transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-ink text-cream'
                  : 'bg-warm-light text-ink'
              }`}
            >
              {msg.content}
              {msg.role === 'assistant' && msg.content === '' && isStreaming && !activeTool && (
                <span className="inline-block w-1.5 h-4 bg-warm-gray/50 animate-pulse" />
              )}
            </div>
          </div>
        ))}

        {/* Tool activity indicator */}
        {activeTool && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 text-xs text-warm-gray px-3 py-1.5">
              <LoadingDots />
              <span>{TOOL_LABELS[activeTool] || `Running ${activeTool}`}</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-warm-border p-3 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            rows={1}
            className="flex-1 bg-warm-light/50 border border-warm-border rounded-lg px-3 py-2 text-sm text-ink placeholder:text-warm-gray resize-none outline-none focus:border-warm-gray transition-colors"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming}
            className="p-2 rounded-lg bg-ink text-cream disabled:opacity-30 hover:bg-ink/90 transition-colors shrink-0"
          >
            <SendIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center justify-between mt-1.5 px-1">
          <span className="text-[10px] text-warm-gray truncate">
            {orgName && <>{orgName}{locationName ? ` / ${locationName}` : ''}</>}
          </span>
          <kbd className="text-[10px] font-mono text-warm-gray bg-warm-light rounded px-1.5 py-0.5 shrink-0">&#8984;J</kbd>
        </div>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop: in-flow flex child that compresses main content */}
      <div
        className={`hidden lg:flex flex-col shrink-0 h-screen sticky top-0 bg-cream overflow-hidden transition-all duration-200 ease-in-out ${
          isOpen ? 'w-96 border-l border-warm-border' : 'w-0'
        }`}
      >
        <div className="w-96 h-full flex flex-col shrink-0">
          {chatContent}
        </div>
      </div>

      {/* Mobile/tablet: fixed overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-ink/20 z-40 lg:hidden"
          onClick={close}
        />
      )}
      <div
        className={`lg:hidden fixed top-0 right-0 h-screen w-full sm:w-96 z-50 flex flex-col bg-cream border-l border-warm-border shadow-xl transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {chatContent}
      </div>
    </>
  )
}

// Icons & Components

function LoadingDots() {
  return (
    <span className="inline-flex gap-0.5">
      <span className="w-1 h-1 bg-warm-gray rounded-full animate-bounce [animation-delay:0ms]" />
      <span className="w-1 h-1 bg-warm-gray rounded-full animate-bounce [animation-delay:150ms]" />
      <span className="w-1 h-1 bg-warm-gray rounded-full animate-bounce [animation-delay:300ms]" />
    </span>
  )
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
    </svg>
  )
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}
