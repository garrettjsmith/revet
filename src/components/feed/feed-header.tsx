'use client'

type FilterType = 'all' | 'reviews' | 'posts' | 'profiles' | 'errors' | 'landers' | 'citations'
type ScopeType = 'all' | 'mine'

interface FeedHeaderProps {
  counts: {
    total: number
    reviews: number
    posts: number
    profiles: number
    errors: number
    landers: number
    citations: number
  } | null
  filter: FilterType
  setFilter: (f: FilterType) => void
  scope: ScopeType
  setScope: (s: ScopeType) => void
  isAgencyAdmin: boolean
}

type CountKeys = 'total' | 'reviews' | 'posts' | 'profiles' | 'errors' | 'landers' | 'citations'

const TABS: { key: FilterType; label: string; countKey: CountKeys }[] = [
  { key: 'all', label: 'All', countKey: 'total' },
  { key: 'reviews', label: 'Reviews', countKey: 'reviews' },
  { key: 'posts', label: 'Posts', countKey: 'posts' },
  { key: 'profiles', label: 'Profiles', countKey: 'profiles' },
  { key: 'citations', label: 'Citations', countKey: 'citations' },
  { key: 'landers', label: 'Landers', countKey: 'landers' },
  { key: 'errors', label: 'Errors', countKey: 'errors' },
]

export function FeedHeader({ counts, filter, setFilter, scope, setScope, isAgencyAdmin }: FeedHeaderProps) {
  return (
    <div className="border-b border-warm-border">
      <div className="px-5 pt-4 pb-0 flex items-center justify-between">
        <h1 className="text-lg font-serif text-ink">Feed</h1>
        {isAgencyAdmin && (
          <select
            value={scope}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setScope(e.target.value as ScopeType)}
            className="text-xs border border-warm-border rounded-lg px-2 py-1 bg-cream text-ink"
          >
            <option value="all">All</option>
            <option value="mine">My Queue</option>
          </select>
        )}
      </div>

      <div className="px-5 pt-3 pb-0 flex gap-1 overflow-x-auto scrollbar-none">
        {TABS.map(({ key, label, countKey }) => {
          const count = counts?.[countKey] ?? 0
          // Hide tabs with 0 items (except "All")
          if (key !== 'all' && count === 0) return null
          const active = filter === key
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs rounded-t-lg border-b-2 transition-colors ${
                active
                  ? 'border-ink text-ink font-medium'
                  : 'border-transparent text-warm-gray hover:text-ink hover:border-warm-border'
              }`}
            >
              {label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                active ? 'bg-ink text-white' : 'bg-warm-light text-warm-gray'
              }`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
