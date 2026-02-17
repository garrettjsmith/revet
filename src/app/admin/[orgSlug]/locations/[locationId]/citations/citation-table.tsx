'use client'

interface CitationListingRow {
  id: string
  directory_name: string
  directory_url: string | null
  listing_url: string | null
  nap_correct: boolean
  name_match: boolean
  address_match: boolean
  phone_match: boolean
  status: string
  found_name: string | null
  found_address: string | null
  found_phone: string | null
  ai_recommendation: string | null
  last_checked_at: string | null
}

export function CitationTable({ listings }: { listings: CitationListingRow[] }) {
  if (listings.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-warm-gray">
        No listings match this filter.
      </div>
    )
  }

  return (
    <div className="border border-warm-border rounded-xl overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-warm-border bg-warm-light/30">
            <th className="text-left px-4 py-3 font-medium text-warm-gray">Directory</th>
            <th className="text-center px-3 py-3 font-medium text-warm-gray">Name</th>
            <th className="text-center px-3 py-3 font-medium text-warm-gray">Address</th>
            <th className="text-center px-3 py-3 font-medium text-warm-gray">Phone</th>
            <th className="text-left px-4 py-3 font-medium text-warm-gray">Status</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((listing) => (
            <CitationRow key={listing.id} listing={listing} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CitationRow({ listing }: { listing: CitationListingRow }) {
  const isNotListed = listing.status === 'not_listed'

  return (
    <tr className="border-b border-warm-border/50 last:border-0 hover:bg-warm-light/20 transition-colors group">
      {/* Directory name + link */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-ink">{listing.directory_name}</span>
          {listing.listing_url && (
            <a
              href={listing.listing_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-warm-gray hover:text-ink transition-colors opacity-0 group-hover:opacity-100"
              title="View listing"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>
        {listing.ai_recommendation && (
          <div className="text-[11px] text-warm-gray mt-0.5 max-w-xs truncate" title={listing.ai_recommendation}>
            {listing.ai_recommendation}
          </div>
        )}
      </td>

      {/* NAP match indicators */}
      <td className="text-center px-3 py-3">
        {isNotListed ? (
          <span className="text-warm-gray/40">--</span>
        ) : (
          <MatchIndicator match={listing.name_match} found={listing.found_name} />
        )}
      </td>
      <td className="text-center px-3 py-3">
        {isNotListed ? (
          <span className="text-warm-gray/40">--</span>
        ) : (
          <MatchIndicator match={listing.address_match} found={listing.found_address} />
        )}
      </td>
      <td className="text-center px-3 py-3">
        {isNotListed ? (
          <span className="text-warm-gray/40">--</span>
        ) : (
          <MatchIndicator match={listing.phone_match} found={listing.found_phone} />
        )}
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <StatusBadge status={listing.status} />
      </td>
    </tr>
  )
}

function MatchIndicator({ match, found }: { match: boolean; found: string | null }) {
  return (
    <span title={found || undefined} className={match ? 'text-emerald-500' : 'text-red-500'}>
      {match ? (
        <svg className="w-4 h-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; classes: string }> = {
    found: { label: 'Correct', classes: 'text-emerald-700 bg-emerald-50' },
    action_needed: { label: 'Incorrect', classes: 'text-amber-700 bg-amber-50' },
    not_listed: { label: 'Not Listed', classes: 'text-red-700 bg-red-50' },
    submitted: { label: 'Submitted', classes: 'text-blue-700 bg-blue-50' },
    verified: { label: 'Verified', classes: 'text-emerald-700 bg-emerald-50' },
    dismissed: { label: 'Dismissed', classes: 'text-warm-gray bg-warm-light' },
  }

  const c = config[status] || { label: status, classes: 'text-warm-gray bg-warm-light' }

  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${c.classes}`}>
      {c.label}
    </span>
  )
}
