'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface SearchableSelectProps<T> {
  placeholder: string
  value: T | null
  onChange: (value: T | null) => void
  fetchFn: (query: string, offset: number) => Promise<{ items: T[]; has_more: boolean }>
  getLabel: (item: T) => string
  getId: (item: T) => string
}

export function SearchableSelect<T>({
  placeholder,
  value,
  onChange,
  fetchFn,
  getLabel,
  getId,
}: SearchableSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<NodeJS.Timeout>()

  const doFetch = useCallback(async (q: string, offset: number, append: boolean) => {
    setLoading(true)
    try {
      const result = await fetchFn(q, offset)
      setItems((prev) => append ? [...prev, ...result.items] : result.items)
      setHasMore(result.has_more)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [fetchFn])

  // Initial load when opening
  useEffect(() => {
    if (open) {
      doFetch(query, 0, false)
      inputRef.current?.focus()
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  useEffect(() => {
    if (!open) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      doFetch(query, 0, false)
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Scroll to load more
  const handleScroll = () => {
    if (!listRef.current || loading || !hasMore) return
    const { scrollTop, scrollHeight, clientHeight } = listRef.current
    if (scrollHeight - scrollTop - clientHeight < 100) {
      doFetch(query, items.length, true)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs border border-warm-border rounded-lg bg-white hover:bg-warm-light/50 transition-colors"
      >
        <span className={value ? 'text-ink' : 'text-warm-gray'}>
          {value ? getLabel(value) : placeholder}
        </span>
        <span className="flex items-center gap-1">
          {value && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onChange(null)
                setOpen(false)
              }}
              className="text-warm-gray hover:text-ink"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <svg className="w-3 h-3 text-warm-gray" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-warm-border rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-warm-border/50">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className="w-full text-xs px-2 py-1.5 bg-warm-light/50 rounded border-0 outline-none placeholder:text-warm-gray"
            />
          </div>
          <div
            ref={listRef}
            onScroll={handleScroll}
            className="max-h-48 overflow-y-auto"
          >
            {items.length === 0 && !loading && (
              <div className="px-3 py-4 text-xs text-warm-gray text-center">No results</div>
            )}
            {items.map((item) => (
              <button
                key={getId(item)}
                type="button"
                onClick={() => {
                  onChange(item)
                  setOpen(false)
                  setQuery('')
                }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-warm-light/50 transition-colors ${
                  value && getId(value) === getId(item) ? 'bg-warm-light font-medium' : ''
                }`}
              >
                {getLabel(item)}
              </button>
            ))}
            {loading && (
              <div className="px-3 py-2 text-xs text-warm-gray text-center animate-pulse">Loading...</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
