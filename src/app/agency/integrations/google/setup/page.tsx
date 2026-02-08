'use client'

import { useEffect, useMemo, useState } from 'react'

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

interface ExistingMapping {
  external_resource_id: string
  location_id: string
  org_id: string
  org_name: string
  sync_status?: 'active' | 'syncing' | 'error'
}

type Tab = 'unmapped' | 'mapped' | 'all'

export default function GoogleSetupPage() {
  const [step, setStep] = useState<'loading' | 'discovering' | 'mapping' | 'saving' | 'done' | 'error' | 'disconnected'>('loading')
  const [gbpLocations, setGbpLocations] = useState<GBPLocation[]>([])
  const [rvetOrgs, setRvetOrgs] = useState<RvetOrg[]>([])
  const [existingMappings, setExistingMappings] = useState<ExistingMapping[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [orgAssignments, setOrgAssignments] = useState<Map<string, string>>(new Map())
  const [lastAssignedOrgId, setLastAssignedOrgId] = useState('')
  const [bulkOrgId, setBulkOrgId] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('unmapped')
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState<string>('all')
  const [cityFilter, setCityFilter] = useState<string>('all')
  const [errorMsg, setErrorMsg] = useState('')
  const [saveResults, setSaveResults] = useState<{ mapped: number; errors: number } | null>(null)
  const [savingProgress, setSavingProgress] = useState({ current: 0, total: 0 })

  // Load data on mount
  useEffect(() => {
    async function loadData() {
      try {
        const [orgsRes, statusRes] = await Promise.all([
          fetch('/api/agency/organizations'),
          fetch('/api/integrations/google/status'),
        ])
        if (orgsRes.ok) {
          const orgsData = await orgsRes.json()
          const orgs = orgsData.organizations || []
          setRvetOrgs(orgs)
          if (orgs.length > 0) {
            setLastAssignedOrgId(orgs[0].id)
            setBulkOrgId(orgs[0].id)
          }
        }
        if (statusRes.ok) {
          const status = await statusRes.json()
          if (!status.connected) {
            setErrorMsg(status.error || 'Google is not connected. Please connect first.')
            setStep('disconnected')
            return
          }
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
        if (res.status === 401) {
          setErrorMsg(errorDetail)
          setStep('disconnected')
          return
        }
        setErrorMsg(errorDetail)
        setStep('error')
        return
      }
      const data = await res.json()
      setGbpLocations(data.locations || [])
      setExistingMappings(data.existingMappings || [])
      setStep('mapping')

      // If there are existing mappings, default to mapped tab
      if (data.existingMappings && data.existingMappings.length > 0) {
        setActiveTab('mapped')
      }
    } catch {
      setErrorMsg('Failed to connect to Google. Please try again.')
      setStep('error')
    }
  }

  // Derived data
  const existingMappedIds = useMemo(
    () => new Set(existingMappings.map((m) => m.external_resource_id)),
    [existingMappings]
  )

  const unmappedLocations = useMemo(
    () => gbpLocations.filter((l) => !existingMappedIds.has(l.name)),
    [gbpLocations, existingMappedIds]
  )

  const mappedLocations = useMemo(
    () => gbpLocations.filter((l) => existingMappedIds.has(l.name)),
    [gbpLocations, existingMappedIds]
  )

  // Get current tab's locations
  const currentTabLocations = useMemo(() => {
    if (activeTab === 'unmapped') return unmappedLocations
    if (activeTab === 'mapped') return mappedLocations
    return gbpLocations
  }, [activeTab, unmappedLocations, mappedLocations, gbpLocations])

  // States and cities for filters
  const states = useMemo(() => {
    const set = new Set<string>()
    currentTabLocations.forEach((l) => {
      const s = l.storefrontAddress?.administrativeArea
      if (s) set.add(s)
    })
    return Array.from(set).sort()
  }, [currentTabLocations])

  const cities = useMemo(() => {
    const set = new Set<string>()
    currentTabLocations.forEach((l) => {
      const c = l.storefrontAddress?.locality
      if (c) set.add(c)
    })
    return Array.from(set).sort()
  }, [currentTabLocations])

  // Filtered locations
  const filtered = useMemo(() => {
    let list = currentTabLocations
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((l) =>
        l.title.toLowerCase().includes(q) ||
        l.storefrontAddress?.locality?.toLowerCase().includes(q) ||
        l.storefrontAddress?.addressLines?.[0]?.toLowerCase().includes(q) ||
        l.metadata?.placeId?.toLowerCase().includes(q)
      )
    }
    if (stateFilter !== 'all') {
      list = list.filter((l) => l.storefrontAddress?.administrativeArea === stateFilter)
    }
    if (cityFilter !== 'all') {
      list = list.filter((l) => l.storefrontAddress?.locality === cityFilter)
    }
    return list
  }, [currentTabLocations, search, stateFilter, cityFilter])

  // Auto-suggest: find most common 2+ word prefix
  const autoSuggest = useMemo(() => {
    if (activeTab === 'mapped') return null

    const unassigned = unmappedLocations.filter((l) => !orgAssignments.has(l.name))
    if (unassigned.length < 5) return null

    // Extract 2-word prefixes
    const prefixCounts = new Map<string, string[]>()
    unassigned.forEach((l) => {
      const words = l.title.split(/\s+/)
      if (words.length >= 2) {
        const prefix = words.slice(0, 2).join(' ')
        if (!prefixCounts.has(prefix)) prefixCounts.set(prefix, [])
        prefixCounts.get(prefix)!.push(l.name)
      }
    })

    // Find the most common prefix with 5+ matches
    let maxCount = 0
    let maxPrefix = ''
    let maxNames: string[] = []
    prefixCounts.forEach((names, prefix) => {
      if (names.length >= 5 && names.length > maxCount) {
        maxCount = names.length
        maxPrefix = prefix
        maxNames = names
      }
    })

    if (maxCount >= 5) {
      return { prefix: maxPrefix, count: maxCount, names: maxNames }
    }
    return null
  }, [unmappedLocations, orgAssignments, activeTab])

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

  // Org assignment
  function assignOrg(locationName: string, orgId: string) {
    setOrgAssignments((prev) => {
      const next = new Map(prev)
      next.set(locationName, orgId)
      return next
    })
    setLastAssignedOrgId(orgId)
  }

  function bulkAssign() {
    if (!bulkOrgId) return
    const selectedList = Array.from(selected)
    setOrgAssignments((prev) => {
      const next = new Map(prev)
      selectedList.forEach((name) => {
        next.set(name, bulkOrgId)
      })
      return next
    })
    setLastAssignedOrgId(bulkOrgId)
  }

  function autoAssignAll() {
    if (!autoSuggest || !bulkOrgId) return
    setOrgAssignments((prev) => {
      const next = new Map(prev)
      autoSuggest.names.forEach((name) => {
        next.set(name, bulkOrgId)
      })
      return next
    })
    setLastAssignedOrgId(bulkOrgId)
  }

  // Save — import only rows with org assigned
  async function importLocations() {
    const toImport = unmappedLocations.filter((l) => orgAssignments.has(l.name))
    if (toImport.length === 0) return

    setStep('saving')
    const toSave = toImport.map((gbp) => ({
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
      org_id: orgAssignments.get(gbp.name)!,
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

  // Move location to different org
  async function moveLocation(locationId: string, newOrgId: string) {
    try {
      const res = await fetch(`/api/locations/${locationId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: newOrgId }),
      })
      if (res.ok) {
        // Refresh mappings
        discover()
      }
    } catch (err) {
      console.error('Failed to move location:', err)
    }
  }

  function formatAddress(gbp: GBPLocation): string {
    const a = gbp.storefrontAddress
    if (!a) return ''
    const street = a.addressLines?.[0] || ''
    const cityState = [a.locality, a.administrativeArea].filter(Boolean).join(', ')
    return [street, cityState].filter(Boolean).join(', ')
  }

  function getMappingForLocation(gbpName: string): ExistingMapping | undefined {
    return existingMappings.find((m) => m.external_resource_id === gbpName)
  }

  // Stats
  const assignedCount = unmappedLocations.filter((l) => orgAssignments.has(l.name)).length

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-serif text-ink">Google Business Profile Setup</h1>
        <p className="text-sm text-warm-gray mt-1">
          Import and manage GBP locations.
        </p>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-3 mb-8">
        {['Connect', 'Discover', 'Import', 'Done'].map((label, i) => {
          const stepIndex: Record<string, number> = { loading: 0, discovering: 1, mapping: 2, saving: 2, done: 3, error: -1, disconnected: 0 }
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
            <button onClick={() => window.location.href = '/agency/integrations'} className="px-5 py-2 bg-ink text-cream text-xs font-medium rounded-full">Back</button>
          </div>
        </div>
      )}

      {/* Disconnected */}
      {step === 'disconnected' && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-6">
          <p className="text-sm text-amber-800 mb-2 font-medium">Google connection expired</p>
          <p className="text-xs text-amber-700 mb-4">
            {errorMsg || 'Your Google connection needs to be re-established.'}
          </p>
          <div className="flex items-center justify-center gap-3">
            <a href="/api/integrations/google/connect" className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-full transition-colors">
              Reconnect Google
            </a>
            <button onClick={() => window.location.href = '/agency/integrations'} className="px-5 py-2 border border-amber-300 text-amber-700 text-xs font-medium rounded-full hover:bg-amber-100 transition-colors">
              Back
            </button>
          </div>
        </div>
      )}

      {/* Mapping — main wizard */}
      {step === 'mapping' && (
        <div>
          {/* Stats pills */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-ink rounded-xl p-5">
              <div className="text-[11px] text-cream/70 uppercase tracking-wider mb-1">Total Locations</div>
              <div className="text-2xl font-serif text-cream">{gbpLocations.length}</div>
            </div>
            <div className="bg-ink rounded-xl p-5">
              <div className="text-[11px] text-cream/70 uppercase tracking-wider mb-1">Already Imported</div>
              <div className="text-2xl font-serif text-cream">{existingMappings.length}</div>
            </div>
            <div className="bg-ink rounded-xl p-5">
              <div className="text-[11px] text-cream/70 uppercase tracking-wider mb-1">Ready to Import</div>
              <div className="text-2xl font-serif text-cream">{assignedCount}</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2 mb-4">
            {(['unmapped', 'mapped', 'all'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab)
                  setSelected(new Set())
                  setSearch('')
                  setStateFilter('all')
                  setCityFilter('all')
                }}
                className={`px-4 py-2 text-xs font-medium rounded-full transition-colors ${
                  activeTab === tab
                    ? 'bg-ink text-cream'
                    : 'border border-warm-border text-warm-gray hover:text-ink hover:border-ink'
                }`}
              >
                {tab === 'unmapped' && `Unmapped (${unmappedLocations.length})`}
                {tab === 'mapped' && `Mapped (${mappedLocations.length})`}
                {tab === 'all' && `All (${gbpLocations.length})`}
              </button>
            ))}
          </div>

          {/* Auto-suggest banner */}
          {autoSuggest && activeTab === 'unmapped' && (
            <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                </svg>
                <div>
                  <p className="text-xs text-amber-800 font-medium">
                    {autoSuggest.count} locations match "{autoSuggest.prefix}"
                  </p>
                  <p className="text-[10px] text-amber-600 mt-0.5">
                    Assign them all to the same organization in one click
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={bulkOrgId}
                  onChange={(e) => setBulkOrgId(e.target.value)}
                  className="text-xs border border-amber-300 rounded-lg px-2.5 py-1.5 bg-white text-amber-900"
                >
                  {rvetOrgs.map((org) => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
                <button
                  onClick={autoAssignAll}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-full transition-colors"
                >
                  Assign all
                </button>
              </div>
            </div>
          )}

          {/* Search and filters */}
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
            {states.length > 1 && (
              <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} className="text-xs border border-warm-border rounded-lg px-3 py-2 bg-white text-ink">
                <option value="all">All states</option>
                {states.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}
            {cities.length > 1 && (
              <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} className="text-xs border border-warm-border rounded-lg px-3 py-2 bg-white text-ink">
                <option value="all">All cities</option>
                {cities.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
          </div>

          {/* Table header with selection */}
          {filtered.length > 0 && (
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
                    {selected.size} selected
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Table */}
          <div className="border border-t-0 border-warm-border rounded-b-xl overflow-hidden">
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-white border-b border-warm-border z-10">
                  <tr>
                    <th className="w-10 px-4 py-2" />
                    <th className="text-left px-3 py-2 text-[11px] text-warm-gray uppercase tracking-wider font-medium">Business Name</th>
                    <th className="text-left px-3 py-2 text-[11px] text-warm-gray uppercase tracking-wider font-medium">Address</th>
                    {activeTab === 'unmapped' && (
                      <th className="text-left px-3 py-2 text-[11px] text-warm-gray uppercase tracking-wider font-medium w-48">Organization</th>
                    )}
                    {activeTab === 'mapped' && (
                      <>
                        <th className="text-left px-3 py-2 text-[11px] text-warm-gray uppercase tracking-wider font-medium w-48">Current Org</th>
                        <th className="text-left px-3 py-2 text-[11px] text-warm-gray uppercase tracking-wider font-medium w-32">Status</th>
                      </>
                    )}
                    {activeTab === 'all' && (
                      <th className="text-left px-3 py-2 text-[11px] text-warm-gray uppercase tracking-wider font-medium w-32">Status</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((gbp) => {
                    const isSelected = selected.has(gbp.name)
                    const isMapped = existingMappedIds.has(gbp.name)
                    const mapping = getMappingForLocation(gbp.name)
                    const assignedOrgId = orgAssignments.get(gbp.name)

                    return (
                      <tr
                        key={gbp.name}
                        className={`border-b border-warm-border/50 last:border-0 transition-colors ${isSelected ? 'bg-ink/[0.03]' : 'hover:bg-warm-light/50'}`}
                      >
                        <td className="w-10 px-4 py-2.5">
                          <button
                            onClick={() => toggleOne(gbp.name)}
                            className="flex items-center justify-center"
                          >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-ink border-ink' : 'border-warm-gray'}`}>
                              {isSelected && <svg className="w-3 h-3 text-cream" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                            </div>
                          </button>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-xs text-ink font-medium">{gbp.title}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-xs text-warm-gray">{formatAddress(gbp) || '—'}</span>
                        </td>

                        {/* Unmapped: org selector */}
                        {activeTab === 'unmapped' && (
                          <td className="px-3 py-2.5">
                            <select
                              value={assignedOrgId || ''}
                              onChange={(e) => assignOrg(gbp.name, e.target.value)}
                              className={`text-xs border rounded-lg px-2.5 py-1.5 bg-white transition-colors ${
                                assignedOrgId
                                  ? 'border-ink text-ink font-medium'
                                  : 'border-warm-border text-warm-gray'
                              }`}
                            >
                              <option value="">Select org...</option>
                              {rvetOrgs.map((org) => (
                                <option key={org.id} value={org.id}>{org.name}</option>
                              ))}
                            </select>
                          </td>
                        )}

                        {/* Mapped: current org + move */}
                        {activeTab === 'mapped' && mapping && (
                          <>
                            <td className="px-3 py-2.5">
                              <select
                                value={mapping.org_id}
                                onChange={(e) => moveLocation(mapping.location_id, e.target.value)}
                                className="text-xs border border-warm-border rounded-lg px-2.5 py-1.5 bg-white text-ink"
                              >
                                {rvetOrgs.map((org) => (
                                  <option key={org.id} value={org.id}>{org.name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                mapping.sync_status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                                mapping.sync_status === 'syncing' ? 'bg-amber-50 text-amber-700' :
                                'bg-warm-light text-warm-gray'
                              }`}>
                                {mapping.sync_status === 'active' ? 'Synced' :
                                 mapping.sync_status === 'syncing' ? 'Syncing' :
                                 'Mapped'}
                              </span>
                            </td>
                          </>
                        )}

                        {/* All: status badge */}
                        {activeTab === 'all' && (
                          <td className="px-3 py-2.5">
                            {isMapped ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700">
                                Imported
                              </span>
                            ) : assignedOrgId ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-ink/10 text-ink">
                                Ready
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-warm-light text-warm-gray">
                                Unassigned
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={activeTab === 'mapped' ? 5 : 4} className="px-4 py-8 text-center text-xs text-warm-gray">
                        No locations match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sticky bottom action bar (when rows selected in unmapped) */}
          {selected.size > 0 && activeTab === 'unmapped' && (
            <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 bg-ink text-cream rounded-full shadow-2xl px-6 py-3 flex items-center gap-4">
              <span className="text-xs font-medium">{selected.size} selected</span>
              <div className="w-px h-4 bg-cream/20" />
              <div className="flex items-center gap-2">
                <span className="text-xs">Assign to:</span>
                <select
                  value={bulkOrgId}
                  onChange={(e) => setBulkOrgId(e.target.value)}
                  className="text-xs border border-cream/30 rounded-lg px-2.5 py-1 bg-ink text-cream"
                >
                  {rvetOrgs.map((org) => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
                <button
                  onClick={bulkAssign}
                  className="px-4 py-1.5 bg-cream text-ink text-xs font-medium rounded-full hover:bg-cream/90 transition-colors"
                >
                  Assign
                </button>
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-between mt-6">
            <button
              onClick={() => window.location.href = '/agency/integrations'}
              className="px-5 py-2 border border-warm-border text-warm-gray text-xs rounded-full hover:text-ink hover:border-ink transition-colors"
            >
              {assignedCount > 0 ? 'Skip for now' : 'Back'}
            </button>
            {activeTab === 'unmapped' && assignedCount > 0 && (
              <button
                onClick={importLocations}
                className="px-6 py-2.5 bg-ink text-cream text-xs font-medium rounded-full hover:bg-ink/90 transition-colors"
              >
                Import {assignedCount} Location{assignedCount !== 1 ? 's' : ''}
              </button>
            )}
          </div>
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
          <button onClick={() => window.location.href = '/agency/integrations'} className="px-6 py-2 bg-ink text-cream text-xs font-medium rounded-full hover:bg-ink/90 transition-colors">
            View Integrations
          </button>
        </div>
      )}
    </div>
  )
}
