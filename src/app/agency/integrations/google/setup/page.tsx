'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

interface GBPLocation {
  name: string
  title: string
  accountName: string
  accountDisplayName: string
  storefrontAddress?: {
    addressLines?: string[]
    locality?: string
    administrativeArea?: string
    postalCode?: string
    regionCode?: string
  }
  phoneNumbers?: { primaryPhone?: string }
  websiteUri?: string
  metadata?: { placeId?: string }
}

interface RvetOrg {
  id: string
  name: string
  slug: string
}

export default function GoogleSetupPage() {
  const router = useRouter()
  const [step, setStep] = useState<'loading' | 'discovering' | 'mapping' | 'saving' | 'done' | 'error'>('loading')
  const [gbpLocations, setGbpLocations] = useState<GBPLocation[]>([])
  const [rvetOrgs, setRvetOrgs] = useState<RvetOrg[]>([])
  const [existingMappedIds, setExistingMappedIds] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [targetOrgId, setTargetOrgId] = useState('')
  const [search, setSearch] = useState('')
  const [accountFilter, setAccountFilter] = useState<string>('all')
  const [stateFilter, setStateFilter] = useState<string>('all')
  const [errorMsg, setErrorMsg] = useState('')
  const [saveResults, setSaveResults] = useState<{ mapped: number; errors: number } | null>(null)
  const [savingProgress, setSavingProgress] = useState({ current: 0, total: 0 })

  // Load data on mount
  useEffect(() => {
    async function loadData() {
      try {
        const [orgsRes] = await Promise.all([
          fetch('/api/agency/organizations'),
        ])
        if (orgsRes.ok) {
          const orgsData = await orgsRes.json()
          const orgs = orgsData.organizations || []
          setRvetOrgs(orgs)
          if (orgs.length > 0) setTargetOrgId(orgs[0].id)
        }
        setStep('discovering')
        discover()
      } catch {
        setStep('discovering')
        discover()
      }
    }
    loadData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function discover() {
    try {
      const res = await fetch('/api/integrations/google/discover', { method: 'POST' })
      if (!res.ok) {
        const text = await res.text()
        let errorDetail = `Discovery failed (${res.status})`
        try { errorDetail = JSON.parse(text).error || errorDetail } catch { /* */ }
        setErrorMsg(errorDetail)
        setStep('error')
        return
      }
      const data = await res.json()
      setGbpLocations(data.locations || [])
      const mapped = new Set<string>((data.existingMappings || []).map((m: any) => m.external_resource_id))
      setExistingMappedIds(mapped)
      setStep('mapping')
    } catch {
      setErrorMsg('Failed to connect to Google. Please try again.')
      setStep('error')
    }
  }

  // Derived data
  const unmapped = useMemo(
    () => gbpLocations.filter((l) => !existingMappedIds.has(l.name)),
    [gbpLocations, existingMappedIds]
  )

  const accounts = useMemo(() => {
    const map = new Map<string, string>()
    unmapped.forEach((l) => map.set(l.accountName, l.accountDisplayName))
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [unmapped])

  const states = useMemo(() => {
    const set = new Set<string>()
    unmapped.forEach((l) => {
      const s = l.storefrontAddress?.administrativeArea
      if (s) set.add(s)
    })
    return Array.from(set).sort()
  }, [unmapped])

  const filtered = useMemo(() => {
    let list = unmapped
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((l) =>
        l.title.toLowerCase().includes(q) ||
        l.storefrontAddress?.locality?.toLowerCase().includes(q) ||
        l.storefrontAddress?.addressLines?.[0]?.toLowerCase().includes(q) ||
        l.metadata?.placeId?.toLowerCase().includes(q)
      )
    }
    if (accountFilter !== 'all') {
      list = list.filter((l) => l.accountName === accountFilter)
    }
    if (stateFilter !== 'all') {
      list = list.filter((l) => l.storefrontAddress?.administrativeArea === stateFilter)
    }
    return list
  }, [unmapped, search, accountFilter, stateFilter])

  // Selection helpers
  function toggleOne(name: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function selectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev)
      filtered.forEach((l) => next.add(l.name))
      return next
    })
  }

  function deselectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev)
      filtered.forEach((l) => next.delete(l.name))
      return next
    })
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.name))

  // Save — send in batches of 25
  async function saveMappings() {
    if (selected.size === 0 || !targetOrgId) return

    setStep('saving')
    const toSave = gbpLocations
      .filter((l) => selected.has(l.name))
      .map((gbp) => ({
        gbp_location_name: gbp.name,
        gbp_location_title: gbp.title,
        gbp_place_id: gbp.metadata?.placeId || '',
        gbp_account_name: gbp.accountName,
        gbp_address: gbp.storefrontAddress ? {
          address_line1: gbp.storefrontAddress.addressLines?.[0] || '',
          city: gbp.storefrontAddress.locality || '',
          state: gbp.storefrontAddress.administrativeArea || '',
          postal_code: gbp.storefrontAddress.postalCode || '',
          country: gbp.storefrontAddress.regionCode || 'US',
        } : undefined,
        gbp_phone: gbp.phoneNumbers?.primaryPhone,
        gbp_website: gbp.websiteUri,
        action: 'create' as const,
        org_id: targetOrgId,
      }))

    setSavingProgress({ current: 0, total: toSave.length })
    let totalMapped = 0
    let totalErrors = 0
    const batchSize = 25

    for (let i = 0; i < toSave.length; i += batchSize) {
      const batch = toSave.slice(i, i + batchSize)
      try {
        const res = await fetch('/api/integrations/google/map', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mappings: batch }),
        })
        const data = await res.json()
        totalMapped += data.mapped || 0
        totalErrors += data.errors || 0
      } catch {
        totalErrors += batch.length
      }
      setSavingProgress({ current: Math.min(i + batchSize, toSave.length), total: toSave.length })
    }

    setSaveResults({ mapped: totalMapped, errors: totalErrors })
    setStep('done')
  }

  function formatAddress(gbp: GBPLocation): string {
    const a = gbp.storefrontAddress
    if (!a) return ''
    return [a.locality, a.administrativeArea].filter(Boolean).join(', ')
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-serif text-ink">Google Business Profile Setup</h1>
        <p className="text-sm text-warm-gray mt-1">
          Import GBP locations into Revet.
        </p>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-3 mb-8">
        {['Connect', 'Discover', 'Import', 'Done'].map((label, i) => {
          const stepIndex: Record<string, number> = { loading: 0, discovering: 1, mapping: 2, saving: 2, done: 3, error: -1 }
          const current = stepIndex[step] ?? -1
          const isActive = i <= current
          return (
            <div key={label} className="flex items-center gap-3">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${isActive ? 'bg-ink text-cream' : 'bg-warm-border text-warm-gray'}`}>
                {i + 1}
              </div>
              <span className={`text-xs ${isActive ? 'text-ink font-medium' : 'text-warm-gray'}`}>{label}</span>
              {i < 3 && <div className={`w-8 h-px ${isActive ? 'bg-ink' : 'bg-warm-border'}`} />}
            </div>
          )
        })}
      </div>

      {/* Loading / Discovering */}
      {(step === 'loading' || step === 'discovering') && (
        <div className="text-center py-16">
          <div className="inline-block w-6 h-6 border-2 border-ink border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-warm-gray">
            {step === 'loading' ? 'Loading...' : 'Discovering GBP locations — this may take a moment for large accounts...'}
          </p>
        </div>
      )}

      {/* Error */}
      {step === 'error' && (
        <div className="border border-red-200 bg-red-50 rounded-xl p-6">
          <p className="text-sm text-red-700 mb-2 font-medium">Discovery failed</p>
          <p className="text-xs text-red-600 font-mono mb-4 break-all">{errorMsg}</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => { setStep('discovering'); discover() }} className="px-5 py-2 border border-red-300 text-red-700 text-xs font-medium rounded-full hover:bg-red-100 transition-colors">Retry</button>
            <button onClick={() => router.push('/agency/integrations')} className="px-5 py-2 bg-ink text-cream text-xs font-medium rounded-full">Back</button>
          </div>
        </div>
      )}

      {/* Mapping — bulk table */}
      {step === 'mapping' && (
        <div>
          {/* Stats bar */}
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs text-warm-gray">
              <span className="text-ink font-semibold">{gbpLocations.length}</span> GBP locations found
              {existingMappedIds.size > 0 && (
                <> · <span className="text-emerald-600 font-medium">{existingMappedIds.size} already imported</span></>
              )}
              {unmapped.length > 0 && (
                <> · <span className="font-medium">{unmapped.length} available</span></>
              )}
            </div>
          </div>

          {unmapped.length === 0 ? (
            <div className="border border-warm-border rounded-xl p-8 text-center">
              <p className="text-sm text-ink font-medium mb-2">All locations are already imported!</p>
              <button onClick={() => router.push('/agency/integrations')} className="px-5 py-2 bg-ink text-cream text-xs font-medium rounded-full mt-2">Done</button>
            </div>
          ) : (
            <>
              {/* Toolbar: search + filters */}
              <div className="flex items-center gap-3 mb-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Search by name, city, or address..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full text-xs border border-warm-border rounded-lg pl-8 pr-3 py-2 bg-white text-ink placeholder:text-warm-gray focus:outline-none focus:ring-1 focus:ring-ink"
                  />
                  <svg className="w-3.5 h-3.5 text-warm-gray absolute left-2.5 top-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                </div>
                {accounts.length > 1 && (
                  <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className="text-xs border border-warm-border rounded-lg px-3 py-2 bg-white text-ink">
                    <option value="all">All accounts ({accounts.length})</option>
                    {accounts.map(([name, display]) => (
                      <option key={name} value={name}>{display}</option>
                    ))}
                  </select>
                )}
                {states.length > 1 && (
                  <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} className="text-xs border border-warm-border rounded-lg px-3 py-2 bg-white text-ink">
                    <option value="all">All states</option>
                    {states.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Bulk action bar */}
              <div className="flex items-center justify-between border border-warm-border rounded-t-xl bg-warm-light/50 px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <button
                    onClick={allFilteredSelected ? deselectAllFiltered : selectAllFiltered}
                    className="flex items-center gap-2 text-xs text-ink hover:text-ink/70"
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${allFilteredSelected ? 'bg-ink border-ink' : 'border-warm-gray'}`}>
                      {allFilteredSelected && <svg className="w-3 h-3 text-cream" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                    </div>
                    {allFilteredSelected ? `Deselect all (${filtered.length})` : `Select all (${filtered.length})`}
                  </button>
                  {selected.size > 0 && (
                    <span className="text-[10px] text-warm-gray">
                      {selected.size} selected total
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-warm-gray">Import into:</span>
                  <select
                    value={targetOrgId}
                    onChange={(e) => setTargetOrgId(e.target.value)}
                    className="text-xs border border-warm-border rounded-lg px-2.5 py-1.5 bg-white text-ink"
                  >
                    <option value="">Select organization...</option>
                    {rvetOrgs.map((org) => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="border border-t-0 border-warm-border rounded-b-xl overflow-hidden">
                <div className="max-h-[60vh] overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-white border-b border-warm-border z-10">
                      <tr>
                        <th className="w-10 px-4 py-2" />
                        <th className="text-left px-3 py-2 text-[10px] text-warm-gray uppercase tracking-wider font-medium">Business Name</th>
                        <th className="text-left px-3 py-2 text-[10px] text-warm-gray uppercase tracking-wider font-medium">Location</th>
                        <th className="text-left px-3 py-2 text-[10px] text-warm-gray uppercase tracking-wider font-medium hidden md:table-cell">Account</th>
                        <th className="text-left px-3 py-2 text-[10px] text-warm-gray uppercase tracking-wider font-medium hidden lg:table-cell">Place ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((gbp) => {
                        const isSelected = selected.has(gbp.name)
                        const addr = formatAddress(gbp)
                        return (
                          <tr
                            key={gbp.name}
                            onClick={() => toggleOne(gbp.name)}
                            className={`border-b border-warm-border/40 last:border-0 cursor-pointer transition-colors ${isSelected ? 'bg-ink/[0.03]' : 'hover:bg-warm-light/30'}`}
                          >
                            <td className="w-10 px-4 py-2.5">
                              <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-ink border-ink' : 'border-warm-gray'}`}>
                                {isSelected && <svg className="w-3 h-3 text-cream" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="text-xs text-ink font-medium">{gbp.title}</span>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="text-xs text-warm-gray">{addr || '—'}</span>
                            </td>
                            <td className="px-3 py-2.5 hidden md:table-cell">
                              <span className="text-[10px] text-warm-gray">{gbp.accountDisplayName}</span>
                            </td>
                            <td className="px-3 py-2.5 hidden lg:table-cell">
                              <span className="text-[10px] text-warm-gray font-mono">{gbp.metadata?.placeId ? gbp.metadata.placeId.slice(0, 16) + '...' : '—'}</span>
                            </td>
                          </tr>
                        )
                      })}
                      {filtered.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-xs text-warm-gray">
                            No locations match your search.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Footer action bar */}
              <div className="flex items-center justify-between mt-6">
                <button
                  onClick={() => router.push('/agency/integrations')}
                  className="px-5 py-2 border border-warm-border text-warm-gray text-xs rounded-full hover:text-ink hover:border-ink transition-colors"
                >
                  Skip for now
                </button>
                <button
                  onClick={saveMappings}
                  disabled={selected.size === 0 || !targetOrgId}
                  className="px-6 py-2.5 bg-ink text-cream text-xs font-medium rounded-full hover:bg-ink/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Import {selected.size} Location{selected.size !== 1 ? 's' : ''}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Saving with progress */}
      {step === 'saving' && (
        <div className="text-center py-16">
          <div className="inline-block w-6 h-6 border-2 border-ink border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-warm-gray mb-2">Importing locations and setting up review sources...</p>
          {savingProgress.total > 0 && (
            <div className="max-w-xs mx-auto">
              <div className="flex items-center justify-between text-[10px] text-warm-gray mb-1">
                <span>{savingProgress.current} of {savingProgress.total}</span>
                <span>{Math.round((savingProgress.current / savingProgress.total) * 100)}%</span>
              </div>
              <div className="w-full h-1.5 bg-warm-border rounded-full overflow-hidden">
                <div className="h-full bg-ink rounded-full transition-all duration-300" style={{ width: `${(savingProgress.current / savingProgress.total) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Done */}
      {step === 'done' && saveResults && (
        <div className="border border-warm-border rounded-xl p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-lg font-serif text-ink mb-2">Import Complete</h2>
          <p className="text-sm text-warm-gray mb-1">
            {saveResults.mapped} location{saveResults.mapped !== 1 ? 's' : ''} imported successfully.
          </p>
          {saveResults.errors > 0 && (
            <p className="text-xs text-amber-600 mb-4">
              {saveResults.errors} had errors.
            </p>
          )}
          <p className="text-xs text-warm-gray mb-6">
            Review sync will begin automatically. Check the Reviews dashboard for incoming reviews.
          </p>
          <button onClick={() => router.push('/agency/integrations')} className="px-6 py-2 bg-ink text-cream text-xs font-medium rounded-full hover:bg-ink/90 transition-colors">
            View Integrations
          </button>
        </div>
      )}
    </div>
  )
}
