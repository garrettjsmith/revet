'use client'

import { useEffect, useState } from 'react'
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

interface RvetLocation {
  id: string
  org_id: string
  name: string
  place_id: string | null
  city: string | null
  state: string | null
}

interface RvetOrg {
  id: string
  name: string
  slug: string
}

interface MappingChoice {
  action: 'map' | 'create' | 'skip'
  location_id?: string
  org_id?: string
}

export default function GoogleSetupPage() {
  const router = useRouter()
  const [step, setStep] = useState<'loading' | 'discovering' | 'mapping' | 'saving' | 'done' | 'error'>('loading')
  const [gbpLocations, setGbpLocations] = useState<GBPLocation[]>([])
  const [rvetLocations, setRvetLocations] = useState<RvetLocation[]>([])
  const [rvetOrgs, setRvetOrgs] = useState<RvetOrg[]>([])
  const [existingMappings, setExistingMappings] = useState<Array<{ external_resource_id: string }>>([])
  const [mappings, setMappings] = useState<Record<string, MappingChoice>>({})
  const [errorMsg, setErrorMsg] = useState('')
  const [saveResults, setSaveResults] = useState<{ mapped: number; errors: number } | null>(null)

  // Load existing Revet data
  useEffect(() => {
    async function loadData() {
      try {
        // Fetch orgs and locations
        const [orgsRes, locsRes] = await Promise.all([
          fetch('/api/agency/organizations'),
          fetch('/api/agency/locations'),
        ])

        if (orgsRes.ok) {
          const orgsData = await orgsRes.json()
          setRvetOrgs(orgsData.organizations || [])
        }
        if (locsRes.ok) {
          const locsData = await locsRes.json()
          setRvetLocations(locsData.locations || [])
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
        const data = await res.json()
        setErrorMsg(data.error || 'Discovery failed')
        setStep('error')
        return
      }

      const data = await res.json()
      setGbpLocations(data.locations || [])
      setExistingMappings(data.existingMappings || [])

      // Auto-suggest mappings based on place_id match
      const autoMappings: Record<string, MappingChoice> = {}
      for (const gbp of (data.locations || [])) {
        const placeId = gbp.metadata?.placeId
        if (placeId) {
          const match = rvetLocations.find((l) => l.place_id === placeId)
          if (match) {
            autoMappings[gbp.name] = { action: 'map', location_id: match.id, org_id: match.org_id }
          }
        }
        // Check if already mapped
        const alreadyMapped = (data.existingMappings || []).find(
          (m: any) => m.external_resource_id === gbp.name
        )
        if (alreadyMapped) {
          autoMappings[gbp.name] = { action: 'skip' }
        }
      }
      setMappings(autoMappings)
      setStep('mapping')
    } catch (err) {
      setErrorMsg('Failed to connect to Google. Please try again.')
      setStep('error')
    }
  }

  function setMapping(gbpName: string, choice: MappingChoice) {
    setMappings((prev) => ({ ...prev, [gbpName]: choice }))
  }

  async function saveMappings() {
    setStep('saving')

    const toSave = Object.entries(mappings)
      .filter(([_, choice]) => choice.action !== 'skip')
      .map(([gbpName, choice]) => {
        const gbp = gbpLocations.find((l) => l.name === gbpName)!
        return {
          gbp_location_name: gbpName,
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
          action: choice.action,
          location_id: choice.location_id,
          org_id: choice.org_id,
        }
      })

    if (toSave.length === 0) {
      router.push('/agency/integrations')
      return
    }

    try {
      const res = await fetch('/api/integrations/google/map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: toSave }),
      })

      const data = await res.json()
      setSaveResults({ mapped: data.mapped || 0, errors: data.errors || 0 })
      setStep('done')
    } catch {
      setErrorMsg('Failed to save mappings')
      setStep('error')
    }
  }

  const alreadyMappedCount = existingMappings.length
  const unmappedLocations = gbpLocations.filter(
    (l) => !existingMappings.find((m) => m.external_resource_id === l.name)
  )

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-serif text-ink">Google Business Profile Setup</h1>
        <p className="text-sm text-warm-gray mt-1">
          Map your Google Business Profile locations to Revet organizations and locations.
        </p>
      </div>

      {/* Progress steps */}
      <div className="flex items-center gap-3 mb-8">
        {['Connect', 'Discover', 'Map', 'Done'].map((label, i) => {
          const stepIndex = { loading: 0, discovering: 1, mapping: 2, saving: 2, done: 3, error: -1 }
          const current = stepIndex[step] ?? -1
          const isActive = i <= current
          return (
            <div key={label} className="flex items-center gap-3">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                isActive ? 'bg-ink text-cream' : 'bg-warm-border text-warm-gray'
              }`}>
                {i + 1}
              </div>
              <span className={`text-xs ${isActive ? 'text-ink font-medium' : 'text-warm-gray'}`}>
                {label}
              </span>
              {i < 3 && <div className={`w-8 h-px ${isActive ? 'bg-ink' : 'bg-warm-border'}`} />}
            </div>
          )
        })}
      </div>

      {/* Loading */}
      {step === 'loading' && (
        <div className="text-center py-12 text-warm-gray text-sm">
          Loading your data...
        </div>
      )}

      {/* Discovering */}
      {step === 'discovering' && (
        <div className="text-center py-12">
          <div className="inline-block w-6 h-6 border-2 border-ink border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-warm-gray">
            Discovering GBP locations from your Google account...
          </p>
        </div>
      )}

      {/* Error */}
      {step === 'error' && (
        <div className="border border-red-200 bg-red-50 rounded-xl p-6 text-center">
          <p className="text-sm text-red-700 mb-4">{errorMsg}</p>
          <button
            onClick={() => router.push('/agency/integrations')}
            className="px-5 py-2 bg-ink text-cream text-xs font-medium rounded-full"
          >
            Back to Integrations
          </button>
        </div>
      )}

      {/* Mapping */}
      {step === 'mapping' && (
        <div>
          {alreadyMappedCount > 0 && (
            <div className="text-xs text-warm-gray mb-4 px-3 py-2 bg-warm-light/50 rounded-lg">
              {alreadyMappedCount} location{alreadyMappedCount !== 1 ? 's' : ''} already mapped.
            </div>
          )}

          {unmappedLocations.length === 0 && gbpLocations.length > 0 && (
            <div className="border border-warm-border rounded-xl p-8 text-center">
              <p className="text-sm text-ink font-medium mb-2">All locations are already mapped!</p>
              <p className="text-xs text-warm-gray mb-4">
                {gbpLocations.length} GBP location{gbpLocations.length !== 1 ? 's' : ''} connected.
              </p>
              <button
                onClick={() => router.push('/agency/integrations')}
                className="px-5 py-2 bg-ink text-cream text-xs font-medium rounded-full"
              >
                Done
              </button>
            </div>
          )}

          {gbpLocations.length === 0 && (
            <div className="border border-warm-border rounded-xl p-8 text-center">
              <p className="text-sm text-ink font-medium mb-2">No GBP locations found</p>
              <p className="text-xs text-warm-gray mb-4">
                Make sure the connected Google account has manager or owner access to Google Business Profiles.
              </p>
              <button
                onClick={() => router.push('/agency/integrations')}
                className="px-5 py-2 bg-ink text-cream text-xs font-medium rounded-full"
              >
                Back to Integrations
              </button>
            </div>
          )}

          {unmappedLocations.length > 0 && (
            <>
              <div className="space-y-4 mb-8">
                {unmappedLocations.map((gbp) => {
                  const choice = mappings[gbp.name] || { action: 'skip' }
                  const address = gbp.storefrontAddress
                  const addressStr = address
                    ? [
                        address.addressLines?.[0],
                        address.locality,
                        address.administrativeArea,
                      ].filter(Boolean).join(', ')
                    : null

                  return (
                    <div key={gbp.name} className="border border-warm-border rounded-xl overflow-hidden">
                      <div className="px-5 py-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-ink">{gbp.title}</h3>
                            {addressStr && (
                              <p className="text-xs text-warm-gray mt-0.5">{addressStr}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1 text-[10px] text-warm-gray">
                              <span className="font-mono">{gbp.accountDisplayName}</span>
                              {gbp.metadata?.placeId && (
                                <span className="font-mono">Place ID: {gbp.metadata.placeId.slice(0, 12)}...</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Action selector */}
                        <div className="mt-4 flex items-center gap-3">
                          <select
                            value={choice.action}
                            onChange={(e) => {
                              const action = e.target.value as 'map' | 'create' | 'skip'
                              setMapping(gbp.name, {
                                action,
                                org_id: choice.org_id || rvetOrgs[0]?.id,
                              })
                            }}
                            className="text-xs border border-warm-border rounded-lg px-3 py-2 bg-white text-ink"
                          >
                            <option value="skip">Skip</option>
                            <option value="map">Map to existing location</option>
                            <option value="create">Create new location</option>
                          </select>

                          {choice.action === 'map' && (
                            <select
                              value={choice.location_id || ''}
                              onChange={(e) => {
                                const loc = rvetLocations.find((l) => l.id === e.target.value)
                                setMapping(gbp.name, {
                                  ...choice,
                                  location_id: e.target.value,
                                  org_id: loc?.org_id || choice.org_id,
                                })
                              }}
                              className="text-xs border border-warm-border rounded-lg px-3 py-2 bg-white text-ink flex-1"
                            >
                              <option value="">Select a location...</option>
                              {rvetLocations.map((loc) => (
                                <option key={loc.id} value={loc.id}>
                                  {loc.name} {loc.city ? `(${loc.city}, ${loc.state})` : ''}
                                </option>
                              ))}
                            </select>
                          )}

                          {choice.action === 'create' && (
                            <select
                              value={choice.org_id || ''}
                              onChange={(e) => setMapping(gbp.name, { ...choice, org_id: e.target.value })}
                              className="text-xs border border-warm-border rounded-lg px-3 py-2 bg-white text-ink flex-1"
                            >
                              <option value="">Select an organization...</option>
                              {rvetOrgs.map((org) => (
                                <option key={org.id} value={org.id}>{org.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => router.push('/agency/integrations')}
                  className="px-5 py-2 border border-warm-border text-warm-gray text-xs rounded-full hover:text-ink hover:border-ink transition-colors"
                >
                  Skip for now
                </button>
                <button
                  onClick={saveMappings}
                  className="px-6 py-2 bg-ink text-cream text-xs font-medium rounded-full hover:bg-ink/90 transition-colors"
                >
                  Save Mappings ({Object.values(mappings).filter((m) => m.action !== 'skip').length})
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Saving */}
      {step === 'saving' && (
        <div className="text-center py-12">
          <div className="inline-block w-6 h-6 border-2 border-ink border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-warm-gray">Saving mappings and setting up review sources...</p>
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
          <h2 className="text-lg font-serif text-ink mb-2">Setup Complete</h2>
          <p className="text-sm text-warm-gray mb-1">
            {saveResults.mapped} location{saveResults.mapped !== 1 ? 's' : ''} mapped successfully.
          </p>
          {saveResults.errors > 0 && (
            <p className="text-xs text-amber-600 mb-4">
              {saveResults.errors} mapping{saveResults.errors !== 1 ? 's' : ''} had errors.
            </p>
          )}
          <p className="text-xs text-warm-gray mb-6">
            Review sync will begin automatically. Check the Reviews dashboard for incoming reviews.
          </p>
          <button
            onClick={() => router.push('/agency/integrations')}
            className="px-6 py-2 bg-ink text-cream text-xs font-medium rounded-full hover:bg-ink/90 transition-colors"
          >
            View Integrations
          </button>
        </div>
      )}
    </div>
  )
}
