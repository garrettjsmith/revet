'use client'

import { useState, useCallback, useEffect, useRef } from 'react'

// ─── Voice & Style Options ──────────────────────────────────

const PERSONALITY_OPTIONS = [
  'Professional & Authoritative',
  'Friendly & Approachable',
  'Bold & Confident',
  'Casual & Conversational',
  'Luxury & Exclusive',
  'Innovative & Tech-Savvy',
]

const TONE_OPTIONS = [
  'Short & Direct',
  'Storytelling & Engaging',
  'Educational & Informative',
  'Persuasive & Sales-Driven',
  'Quirky & Playful',
]

const FORMALITY_OPTIONS = [
  'Formal & Traditional',
  'Neutral & Balanced',
  'Casual & Relaxed',
  'Edgy & Bold',
]

const AESTHETIC_OPTIONS = [
  'Clean & Minimalist',
  'Bold & Eye-Catching',
  'Classic & Timeless',
  'Fun & Playful',
  'Luxury & High-End',
  'Edgy & Modern',
]

const COLOR_MOOD_OPTIONS = [
  'Bright & Vibrant',
  'Soft & Neutral',
  'Dark & Moody',
  'Corporate & Professional',
  'Monochrome & Minimal',
]

const TYPOGRAPHY_OPTIONS = [
  'Classic & Serif',
  'Modern & Sans-Serif',
  'Handwritten & Casual',
  'Bold & Heavy',
]

// ─── Types ──────────────────────────────────────────────────

interface LocationOption {
  id: string
  name: string
  city: string | null
  state: string | null
  place_id: string | null
}

interface IntakeFormProps {
  orgId: string
  orgName: string
  orgLogo: string | null
  locations: LocationOption[]
  preselectedLocationId: string | null
  existingBrand: { primaryColor: string | null; logoUrl: string | null } | null
  googlePlacesApiKey: string
}

interface ServiceRow {
  name: string
  description: string
}

// ─── Main Component ─────────────────────────────────────────

export function IntakeForm({
  orgId,
  orgName,
  orgLogo,
  locations,
  preselectedLocationId,
  existingBrand,
  googlePlacesApiKey,
}: IntakeFormProps) {
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Step 0: Location selection (only if multiple)
  const [locationId, setLocationId] = useState(preselectedLocationId || '')

  // Step 1: Business Info
  const [businessName, setBusinessName] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [category, setCategory] = useState('')
  const [hoursOfOperation, setHoursOfOperation] = useState('')
  const [holidayClosures, setHolidayClosures] = useState('')

  // Step 2: About & Services
  const [businessDescription, setBusinessDescription] = useState('')
  const [highlights, setHighlights] = useState<string[]>([])
  const [highlightInput, setHighlightInput] = useState('')
  const [services, setServices] = useState<ServiceRow[]>([{ name: '', description: '' }])
  const [serviceRadius, setServiceRadius] = useState('')
  const [targetCities, setTargetCities] = useState('')
  const [foundingYear, setFoundingYear] = useState('')
  const [foundingCity, setFoundingCity] = useState('')

  // Step 3: Keywords
  const [keywords, setKeywords] = useState<string[]>([])
  const [suggestedKeywords, setSuggestedKeywords] = useState<string[]>([])
  const [keywordInput, setKeywordInput] = useState('')
  const [loadingKeywords, setLoadingKeywords] = useState(false)

  // Step 4: Brand Voice
  const [personality, setPersonality] = useState('')
  const [tone, setTone] = useState<string[]>([])
  const [formality, setFormality] = useState('')
  const [voiceNotes, setVoiceNotes] = useState('')

  // Step 5: Visual Style
  const [aesthetic, setAesthetic] = useState('')
  const [colorMood, setColorMood] = useState('')
  const [typography, setTypography] = useState('')
  const [primaryColor, setPrimaryColor] = useState(existingBrand?.primaryColor || '#1a1a1a')
  const [secondaryColor, setSecondaryColor] = useState('')
  const [styleNotes, setStyleNotes] = useState('')

  // Step 6: Assets & Preferences
  const [logoUrl, setLogoUrl] = useState(existingBrand?.logoUrl || '')
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [cloudFolderUrl, setCloudFolderUrl] = useState('')
  const [postApprovalMode, setPostApprovalMode] = useState<'approve_first' | 'auto_post'>('approve_first')
  const [clientContactPhone, setClientContactPhone] = useState('')
  const [additionalNotes, setAdditionalNotes] = useState('')

  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingPhotos, setUploadingPhotos] = useState(false)

  // Auto-start at step 1 if single location
  useEffect(() => {
    if (locations.length === 1 && preselectedLocationId) {
      setLocationId(preselectedLocationId)
      setStep(1)
    }
  }, [locations.length, preselectedLocationId])

  // ─── Places Autocomplete ────────────────────────────────────

  const autocompleteRef = useRef<HTMLInputElement>(null)
  const placesInitialized = useRef(false)

  useEffect(() => {
    if (step !== 1 || !googlePlacesApiKey || placesInitialized.current) return

    // Load Google Places script
    if (!document.getElementById('google-places-script')) {
      const script = document.createElement('script')
      script.id = 'google-places-script'
      script.src = `https://maps.googleapis.com/maps/api/js?key=${googlePlacesApiKey}&libraries=places`
      script.async = true
      script.onload = () => initAutocomplete()
      document.head.appendChild(script)
    } else if ((window as any).google?.maps?.places) {
      initAutocomplete()
    }
  }, [step, googlePlacesApiKey])

  const initAutocomplete = useCallback(() => {
    if (!autocompleteRef.current || placesInitialized.current) return
    if (!(window as any).google?.maps?.places) return

    placesInitialized.current = true
    const autocomplete = new (window as any).google.maps.places.Autocomplete(
      autocompleteRef.current,
      { types: ['establishment'], fields: ['name', 'formatted_address', 'address_components', 'formatted_phone_number', 'website', 'types'] }
    )

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace()
      if (!place) return

      if (place.name) setBusinessName(place.name)
      if (place.formatted_phone_number) setPhone(place.formatted_phone_number)
      if (place.website) setWebsite(place.website)

      // Extract address components
      const components = place.address_components || []
      for (const comp of components) {
        const types = comp.types || []
        if (types.includes('street_number') || types.includes('route')) {
          // Build address line
        }
        if (types.includes('locality')) setCity(comp.long_name)
        if (types.includes('administrative_area_level_1')) setState(comp.short_name)
        if (types.includes('postal_code')) setPostalCode(comp.long_name)
      }

      // Build full address
      const streetNumber = components.find((c: any) => c.types.includes('street_number'))?.long_name || ''
      const route = components.find((c: any) => c.types.includes('route'))?.long_name || ''
      if (streetNumber || route) {
        setAddressLine1([streetNumber, route].filter(Boolean).join(' '))
      }

      // Extract category from types
      if (place.types?.length) {
        const mainType = place.types.find((t: string) => t !== 'point_of_interest' && t !== 'establishment')
        if (mainType) {
          setCategory(mainType.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()))
        }
      }
    })
  }, [])

  // ─── Keyword Loading ────────────────────────────────────────

  const loadKeywords = useCallback(async () => {
    if (!category || loadingKeywords) return
    setLoadingKeywords(true)
    try {
      const params = new URLSearchParams({ category })
      if (city) params.set('city', city)
      if (state) params.set('state', state)
      const res = await fetch(`/api/intake/keywords?${params}`)
      if (res.ok) {
        const data = await res.json()
        setSuggestedKeywords(data.keywords || [])
      }
    } catch { /* ignore */ }
    setLoadingKeywords(false)
  }, [category, city, state, loadingKeywords])

  useEffect(() => {
    if (step === 3 && suggestedKeywords.length === 0 && category) {
      loadKeywords()
    }
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── File Upload ────────────────────────────────────────────

  const uploadFile = async (file: File, folder: string): Promise<string | null> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('folder', folder)

    try {
      const res = await fetch('/api/intake/upload', { method: 'POST', body: formData })
      if (res.ok) {
        const data = await res.json()
        return data.url
      }
    } catch { /* ignore */ }
    return null
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true)
    const url = await uploadFile(file, `intake/${orgId}/logo`)
    if (url) setLogoUrl(url)
    setUploadingLogo(false)
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    setUploadingPhotos(true)
    const urls: string[] = []
    for (let i = 0; i < Math.min(files.length, 10); i++) {
      const url = await uploadFile(files[i], `intake/${orgId}/photos`)
      if (url) urls.push(url)
    }
    setPhotoUrls((prev) => [...prev, ...urls])
    setUploadingPhotos(false)
  }

  // ─── Submit ─────────────────────────────────────────────────

  const handleSubmit = async () => {
    setSubmitting(true)

    try {
      const res = await fetch('/api/intake/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          location_id: locationId,
          business_name: businessName || undefined,
          address_line1: addressLine1 || undefined,
          city: city || undefined,
          state: state || undefined,
          postal_code: postalCode || undefined,
          phone: phone || undefined,
          website: website || undefined,
          category: category || undefined,
          hours_of_operation: hoursOfOperation || undefined,
          holiday_closures: holidayClosures || undefined,
          keywords,
          services: services.filter((s) => s.name.trim()),
          target_cities: targetCities.split('\n').map((c) => c.trim()).filter(Boolean),
          voice_selections: {
            personality: personality || undefined,
            tone: tone.length > 0 ? tone : undefined,
            formality: formality || undefined,
          },
          voice_notes: voiceNotes || undefined,
          style_selections: {
            aesthetic: aesthetic || undefined,
            color_mood: colorMood || undefined,
            typography: typography || undefined,
          },
          style_notes: styleNotes || undefined,
          primary_color: primaryColor || undefined,
          secondary_color: secondaryColor || undefined,
          logo_url: logoUrl || undefined,
          photo_urls: photoUrls.length > 0 ? photoUrls : undefined,
          cloud_folder_url: cloudFolderUrl || undefined,
          business_description: businessDescription || undefined,
          highlights: highlights.length > 0 ? highlights : undefined,
          founding_year: foundingYear || undefined,
          founding_city: foundingCity || undefined,
          service_radius: serviceRadius || undefined,
          post_approval_mode: postApprovalMode,
          client_contact_phone: clientContactPhone || undefined,
          additional_notes: additionalNotes || undefined,
        }),
      })

      if (res.ok) {
        setSubmitted(true)
      }
    } catch { /* ignore */ }
    setSubmitting(false)
  }

  // ─── Step Config ────────────────────────────────────────────

  const steps = locations.length > 1
    ? ['Location', 'Business', 'Services', 'Keywords', 'Voice', 'Style', 'Assets']
    : ['Business', 'Services', 'Keywords', 'Voice', 'Style', 'Assets']

  const totalSteps = steps.length
  const canProceed = () => {
    if (step === 0 && locations.length > 1) return !!locationId
    return true
  }

  // ─── Submitted State ────────────────────────────────────────

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Thank you!</h1>
          <p className="text-gray-500">Your intake form has been submitted. Our team will begin setting up your profile optimization right away.</p>
        </div>
      </div>
    )
  }

  // ─── Render ─────────────────────────────────────────────────

  const effectiveStep = locations.length > 1 ? step : step + 1

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {orgLogo ? (
              <img src={orgLogo} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-500">
                {orgName.charAt(0)}
              </div>
            )}
            <span className="text-sm font-medium text-gray-900">{orgName}</span>
          </div>
          <span className="text-xs text-gray-400">
            Step {step + 1} of {totalSteps}
          </span>
        </div>
      </div>

      {/* Progress */}
      <div className="px-6 py-2">
        <div className="max-w-2xl mx-auto">
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gray-900 rounded-full transition-all duration-300"
              style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            {steps.map((s, i) => (
              <span key={i} className={`text-[10px] ${i <= step ? 'text-gray-900' : 'text-gray-300'}`}>{s}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 py-8">
        <div className="max-w-2xl mx-auto">

          {/* Step 0: Location Selection (if multi-location) */}
          {effectiveStep === 0 && (
            <StepContainer title="Select a location" subtitle="Which location are we setting up?">
              <div className="space-y-2">
                {locations.map((loc) => (
                  <button
                    key={loc.id}
                    onClick={() => setLocationId(loc.id)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                      locationId === loc.id
                        ? 'border-gray-900 bg-gray-50'
                        : 'border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <div className="text-sm font-medium text-gray-900">{loc.name}</div>
                    {(loc.city || loc.state) && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        {[loc.city, loc.state].filter(Boolean).join(', ')}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </StepContainer>
          )}

          {/* Step 1: Business Info */}
          {effectiveStep === 1 && (
            <StepContainer title="Business information" subtitle="Search for your business or enter details manually.">
              <div className="space-y-4">
                {googlePlacesApiKey && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Search your business</label>
                    <input
                      ref={autocompleteRef}
                      type="text"
                      placeholder="Start typing your business name..."
                      className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-gray-900 bg-gray-50"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Auto-fills from Google Places</p>
                  </div>
                )}

                <div className="border-t border-gray-100 pt-4 grid grid-cols-1 gap-4">
                  <FormInput label="Business Name" value={businessName} onChange={setBusinessName} placeholder="As it appears on Google" />
                  <FormInput label="Address" value={addressLine1} onChange={setAddressLine1} />
                  <div className="grid grid-cols-3 gap-3">
                    <FormInput label="City" value={city} onChange={setCity} />
                    <FormInput label="State" value={state} onChange={setState} />
                    <FormInput label="Zip Code" value={postalCode} onChange={setPostalCode} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FormInput label="Phone" value={phone} onChange={setPhone} placeholder="Primary business phone" />
                    <FormInput label="Website" value={website} onChange={setWebsite} placeholder="https://" />
                  </div>
                  <FormInput label="Business Category" value={category} onChange={setCategory} placeholder="e.g. Dentist, Restaurant, Attorney" />
                  <FormTextarea label="Hours of Operation" value={hoursOfOperation} onChange={setHoursOfOperation} placeholder="Mon-Fri 9am-5pm, Sat 10am-2pm" rows={3} />
                  <FormTextarea label="Upcoming Holiday Closures" value={holidayClosures} onChange={setHolidayClosures} placeholder="Optional — any closures in the next 30 days" rows={2} optional />
                </div>
              </div>
            </StepContainer>
          )}

          {/* Step 2: About & Services */}
          {effectiveStep === 2 && (
            <StepContainer title="About your business" subtitle="Tell us about your services and what makes you unique.">
              <div className="space-y-4">
                <FormTextarea
                  label="Business Description"
                  value={businessDescription}
                  onChange={setBusinessDescription}
                  placeholder="Share the highlights of your business — what you do, who you serve, what sets you apart..."
                  rows={4}
                />

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Company Highlights</label>
                  <p className="text-[10px] text-gray-400 mb-2">e.g. 24 Hour Service, Free Estimates, Veteran Owned</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {highlights.map((h, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 rounded-full px-2.5 py-1">
                        {h}
                        <button onClick={() => setHighlights(highlights.filter((_, j) => j !== i))} className="text-gray-400 hover:text-gray-600">x</button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={highlightInput}
                      onChange={(e) => setHighlightInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && highlightInput.trim()) {
                          e.preventDefault()
                          setHighlights([...highlights, highlightInput.trim()])
                          setHighlightInput('')
                        }
                      }}
                      placeholder="Type and press Enter"
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Services / Products</label>
                  <p className="text-[10px] text-gray-400 mb-2">Name and brief description of each</p>
                  <div className="space-y-2">
                    {services.map((s, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          value={s.name}
                          onChange={(e) => {
                            const updated = [...services]
                            updated[i] = { ...updated[i], name: e.target.value }
                            setServices(updated)
                          }}
                          placeholder="Service name"
                          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900"
                        />
                        <input
                          value={s.description}
                          onChange={(e) => {
                            const updated = [...services]
                            updated[i] = { ...updated[i], description: e.target.value }
                            setServices(updated)
                          }}
                          placeholder="Brief description"
                          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900"
                        />
                        {services.length > 1 && (
                          <button onClick={() => setServices(services.filter((_, j) => j !== i))} className="text-gray-400 hover:text-gray-600 text-sm px-2">x</button>
                        )}
                      </div>
                    ))}
                    {services.length < 10 && (
                      <button
                        onClick={() => setServices([...services, { name: '', description: '' }])}
                        className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
                      >
                        + Add another service
                      </button>
                    )}
                  </div>
                </div>

                <FormTextarea label="Service Radius / Target Area" value={serviceRadius} onChange={setServiceRadius} placeholder="e.g. 20-mile radius from downtown, Metro Austin area" rows={2} optional />
                <FormTextarea label="Top Cities or Neighborhoods to Target" value={targetCities} onChange={setTargetCities} placeholder="One per line" rows={3} optional />

                <div className="grid grid-cols-2 gap-3">
                  <FormInput label="Year Founded" value={foundingYear} onChange={setFoundingYear} placeholder="e.g. 2010" optional />
                  <FormInput label="City Founded" value={foundingCity} onChange={setFoundingCity} placeholder="e.g. Austin, TX" optional />
                </div>
              </div>
            </StepContainer>
          )}

          {/* Step 3: Keywords */}
          {effectiveStep === 3 && (
            <StepContainer title="Keywords" subtitle="Select keywords customers use to find businesses like yours.">
              <div className="space-y-4">
                {loadingKeywords ? (
                  <div className="text-sm text-gray-400 animate-pulse">Generating keyword suggestions...</div>
                ) : suggestedKeywords.length > 0 ? (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">Suggested keywords — tap to select</label>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestedKeywords.map((kw) => {
                        const selected = keywords.includes(kw)
                        return (
                          <button
                            key={kw}
                            onClick={() => {
                              if (selected) {
                                setKeywords(keywords.filter((k) => k !== kw))
                              } else {
                                setKeywords([...keywords, kw])
                              }
                            }}
                            className={`text-xs rounded-full px-3 py-1.5 border transition-colors ${
                              selected
                                ? 'bg-gray-900 text-white border-gray-900'
                                : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                            }`}
                          >
                            {kw}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={loadKeywords}
                    disabled={!category}
                    className="text-sm text-gray-500 hover:text-gray-900 disabled:opacity-50"
                  >
                    {category ? 'Generate keyword suggestions' : 'Enter a business category first to get suggestions'}
                  </button>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Add your own keywords</label>
                  <div className="flex gap-2">
                    <input
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && keywordInput.trim()) {
                          e.preventDefault()
                          if (!keywords.includes(keywordInput.trim().toLowerCase())) {
                            setKeywords([...keywords, keywordInput.trim().toLowerCase()])
                          }
                          setKeywordInput('')
                        }
                      }}
                      placeholder="Type a keyword and press Enter"
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900"
                    />
                  </div>
                </div>

                {keywords.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">Selected ({keywords.length})</label>
                    <div className="flex flex-wrap gap-1.5">
                      {keywords.map((kw) => (
                        <span key={kw} className="inline-flex items-center gap-1 text-xs bg-gray-900 text-white rounded-full px-2.5 py-1">
                          {kw}
                          <button onClick={() => setKeywords(keywords.filter((k) => k !== kw))} className="text-gray-400 hover:text-white">x</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </StepContainer>
          )}

          {/* Step 4: Brand Voice */}
          {effectiveStep === 4 && (
            <StepContainer title="Brand voice" subtitle="How should your business sound online?">
              <div className="space-y-6">
                <ChipSelect
                  label="What best describes your brand's personality?"
                  options={PERSONALITY_OPTIONS}
                  value={personality}
                  onChange={setPersonality}
                />
                <ChipMultiSelect
                  label="How should your content sound? (pick up to 2)"
                  options={TONE_OPTIONS}
                  value={tone}
                  onChange={setTone}
                  max={2}
                />
                <ChipSelect
                  label="How formal should your content be?"
                  options={FORMALITY_OPTIONS}
                  value={formality}
                  onChange={setFormality}
                />
                <FormTextarea label="Any extra notes about your brand voice?" value={voiceNotes} onChange={setVoiceNotes} placeholder="Optional" rows={2} optional />
              </div>
            </StepContainer>
          )}

          {/* Step 5: Visual Style */}
          {effectiveStep === 5 && (
            <StepContainer title="Visual style" subtitle="How should your posts and content look?">
              <div className="space-y-6">
                <ChipSelect
                  label="What best describes your brand's aesthetic?"
                  options={AESTHETIC_OPTIONS}
                  value={aesthetic}
                  onChange={setAesthetic}
                />
                <ChipSelect
                  label="What color style fits your brand?"
                  options={COLOR_MOOD_OPTIONS}
                  value={colorMood}
                  onChange={setColorMood}
                />
                <ChipSelect
                  label="What typography style suits your brand?"
                  options={TYPOGRAPHY_OPTIONS}
                  value={typography}
                  onChange={setTypography}
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Primary brand color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900 font-mono"
                        placeholder="#000000"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Secondary color <span className="text-gray-400">(optional)</span></label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={secondaryColor || '#ffffff'}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900 font-mono"
                        placeholder="#ffffff"
                      />
                    </div>
                  </div>
                </div>
                <FormTextarea label="Any additional brand style notes?" value={styleNotes} onChange={setStyleNotes} placeholder="Link to style guide, font names, etc." rows={2} optional />
              </div>
            </StepContainer>
          )}

          {/* Step 6: Assets & Preferences */}
          {effectiveStep === 6 && (
            <StepContainer title="Assets & preferences" subtitle="Upload your brand assets and set your preferences.">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Company Logo</label>
                  {logoUrl ? (
                    <div className="flex items-center gap-3">
                      <img src={logoUrl} alt="" className="w-16 h-16 rounded-lg object-contain border border-gray-200" />
                      <button onClick={() => setLogoUrl('')} className="text-xs text-gray-400 hover:text-gray-600">Remove</button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center w-full h-24 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-gray-400 transition-colors">
                      <span className="text-sm text-gray-400">{uploadingLogo ? 'Uploading...' : 'Click to upload logo'}</span>
                      <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo} />
                    </label>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Company Photos <span className="text-gray-400">(up to 10)</span></label>
                  {photoUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {photoUrls.map((url, i) => (
                        <div key={i} className="relative group">
                          <img src={url} alt="" className="w-20 h-20 rounded-lg object-cover border border-gray-200" />
                          <button
                            onClick={() => setPhotoUrls(photoUrls.filter((_, j) => j !== i))}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-900 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {photoUrls.length < 10 && (
                    <label className="flex items-center justify-center w-full h-20 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-gray-400 transition-colors">
                      <span className="text-sm text-gray-400">{uploadingPhotos ? 'Uploading...' : 'Click to upload photos'}</span>
                      <input type="file" className="hidden" accept="image/*" multiple onChange={handlePhotoUpload} disabled={uploadingPhotos} />
                    </label>
                  )}
                </div>

                <FormInput label="Link to folder with photos or videos" value={cloudFolderUrl} onChange={setCloudFolderUrl} placeholder="Google Drive, Dropbox, Box, OneDrive URL" optional />

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Post approval preference</label>
                  <div className="space-y-2">
                    <button
                      onClick={() => setPostApprovalMode('approve_first')}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                        postApprovalMode === 'approve_first'
                          ? 'border-gray-900 bg-gray-50'
                          : 'border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      <div className="text-sm font-medium text-gray-900">Send for approval first</div>
                      <div className="text-xs text-gray-500 mt-0.5">We'll email you a batch of posts to review before they go live</div>
                    </button>
                    <button
                      onClick={() => setPostApprovalMode('auto_post')}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                        postApprovalMode === 'auto_post'
                          ? 'border-gray-900 bg-gray-50'
                          : 'border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      <div className="text-sm font-medium text-gray-900">Auto-post</div>
                      <div className="text-xs text-gray-500 mt-0.5">Trust us to post on your behalf — no approval needed</div>
                    </button>
                  </div>
                </div>

                <FormInput label="Best contact number" value={clientContactPhone} onChange={setClientContactPhone} placeholder="In case we need to reach you" />
                <FormTextarea label="Additional notes" value={additionalNotes} onChange={setAdditionalNotes} placeholder="Anything else we should know about your business or preferences?" rows={3} optional />
              </div>
            </StepContainer>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="border-t border-gray-100 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-900 disabled:opacity-0 transition-colors"
          >
            Back
          </button>

          {step < totalSteps - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="px-6 py-2.5 text-sm bg-gray-900 text-white rounded-full hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2.5 text-sm bg-gray-900 text-white rounded-full hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          )}
        </div>
      </div>

      {/* Powered by footer */}
      <div className="text-center py-3">
        <span className="text-[10px] text-gray-300">Powered by revet.app</span>
      </div>
    </div>
  )
}

// ─── Shared Form Components ──────────────────────────────────

function StepContainer({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-1">{title}</h2>
      <p className="text-sm text-gray-500 mb-6">{subtitle}</p>
      {children}
    </div>
  )
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
  optional,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  optional?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label} {optional && <span className="text-gray-400">(optional)</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900"
      />
    </div>
  )
}

function FormTextarea({
  label,
  value,
  onChange,
  placeholder,
  rows,
  optional,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  optional?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label} {optional && <span className="text-gray-400">(optional)</span>}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows || 3}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900 resize-none"
      />
    </div>
  )
}

function ChipSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(value === opt ? '' : opt)}
            className={`text-sm rounded-full px-4 py-2 border transition-colors ${
              value === opt
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

function ChipMultiSelect({
  label,
  options,
  value,
  onChange,
  max,
}: {
  label: string
  options: string[]
  value: string[]
  onChange: (v: string[]) => void
  max: number
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = value.includes(opt)
          return (
            <button
              key={opt}
              onClick={() => {
                if (selected) {
                  onChange(value.filter((v) => v !== opt))
                } else if (value.length < max) {
                  onChange([...value, opt])
                }
              }}
              className={`text-sm rounded-full px-4 py-2 border transition-colors ${
                selected
                  ? 'bg-gray-900 text-white border-gray-900'
                  : value.length >= max
                    ? 'bg-white text-gray-300 border-gray-100 cursor-not-allowed'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}
