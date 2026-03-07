'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { VoiceSelections } from '@/lib/types'

type TrustLevel = 'auto' | 'queue' | 'off'

interface StageInfo {
  id: string
  label: string
  status: 'completed' | 'active' | 'failed' | 'pending'
  phases: { phase: string; label: string; status: string }[]
}

type ProfileSkillKey = 'description' | 'categories' | 'attributes' | 'hours' | 'media' | 'services' | 'website'

const PROFILE_SKILL_LABELS: { key: ProfileSkillKey; label: string }[] = [
  { key: 'description', label: 'Description' },
  { key: 'categories', label: 'Categories' },
  { key: 'attributes', label: 'Attributes' },
  { key: 'hours', label: 'Hours' },
  { key: 'media', label: 'Media' },
  { key: 'services', label: 'Services' },
  { key: 'website', label: 'Website UTM' },
]

const DEFAULT_PROFILE_SKILLS: Record<ProfileSkillKey, TrustLevel> = {
  description: 'queue',
  categories: 'queue',
  attributes: 'queue',
  hours: 'queue',
  media: 'queue',
  services: 'queue',
  website: 'queue',
}

interface SetupFlowProps {
  orgId: string
  orgSlug: string
  locationId: string
  locationName: string
  hasIntake: boolean
  hasBrandVoice: boolean
  hasAgentConfig: boolean
  agentConfig: {
    enabled: boolean
    review_replies: TrustLevel
    post_publishing: TrustLevel
    profile_skills?: Record<ProfileSkillKey, TrustLevel>
  } | null
  auditScore: number | null
  stages: StageInfo[]
  brandVoice?: VoiceSelections | null
}

const PERSONALITY_OPTIONS = [
  'Professional & Authoritative',
  'Friendly & Approachable',
  'Bold & Confident',
  'Casual & Conversational',
]

const TONE_OPTIONS = [
  'Short & Direct',
  'Storytelling & Engaging',
  'Educational & Informative',
  'Persuasive & Sales-Driven',
]

const FORMALITY_OPTIONS = [
  'Formal & Traditional',
  'Neutral & Balanced',
  'Casual & Relaxed',
]

const TRUST_OPTIONS: { value: TrustLevel; label: string; desc: string }[] = [
  { value: 'auto', label: 'Auto', desc: 'Agent acts automatically' },
  { value: 'queue', label: 'Queue', desc: 'Agent drafts, you approve' },
  { value: 'off', label: 'Off', desc: 'Disabled for this skill' },
]

type Step = 'intake' | 'brand' | 'agent' | 'review' | 'done'

export function SetupFlow({
  orgId,
  orgSlug,
  locationId,
  locationName,
  hasIntake,
  hasBrandVoice,
  hasAgentConfig,
  agentConfig,
  auditScore,
  stages,
  brandVoice,
}: SetupFlowProps) {
  const router = useRouter()

  // Determine starting step — skip completed steps
  const steps: Step[] = []
  if (!hasIntake) steps.push('intake')
  if (!hasBrandVoice) steps.push('brand')
  steps.push('agent', 'review', 'done')

  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const currentStep = steps[currentStepIndex]
  const [saving, setSaving] = useState(false)

  // Brand voice state
  const [personality, setPersonality] = useState(brandVoice?.personality || '')
  const [tone, setTone] = useState<string[]>(brandVoice?.tone || [])
  const [formality, setFormality] = useState(brandVoice?.formality || '')

  // Agent config state
  const [agentEnabled, setAgentEnabled] = useState(agentConfig?.enabled ?? true)
  const [reviewReplies, setReviewReplies] = useState<TrustLevel>(agentConfig?.review_replies ?? 'queue')
  const [postPublishing, setPostPublishing] = useState<TrustLevel>(agentConfig?.post_publishing ?? 'queue')
  const [profileSkills, setProfileSkills] = useState<Record<ProfileSkillKey, TrustLevel>>(
    agentConfig?.profile_skills ?? DEFAULT_PROFILE_SKILLS
  )

  const goNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1)
    }
  }

  const goBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1)
    }
  }

  const saveBrandAndNext = async () => {
    setSaving(true)
    try {
      await fetch(`/api/orgs/${orgId}/brand-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice_selections: { personality, tone, formality },
        }),
      })
      goNext()
    } finally {
      setSaving(false)
    }
  }

  const saveAgentAndNext = async () => {
    setSaving(true)
    try {
      await fetch(`/api/locations/${locationId}/agent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_id: locationId,
          enabled: agentEnabled,
          review_replies: reviewReplies,
          post_publishing: postPublishing,
          profile_skills: profileSkills,
        }),
      })
      goNext()
    } finally {
      setSaving(false)
    }
  }

  const [launching, setLaunching] = useState(false)

  const finish = async () => {
    // Trigger initial agent run so the first audit has full context
    setLaunching(true)
    try {
      await fetch(`/api/locations/${locationId}/agent`, {
        method: 'POST',
      })
    } catch { /* best-effort */ }
    router.push(`/admin/${orgSlug}/locations/${locationId}`)
  }

  const stepLabels: Record<Step, string> = {
    intake: 'Business Details',
    brand: 'Brand Voice',
    agent: 'Agent Setup',
    review: 'Pipeline Status',
    done: 'Complete',
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="text-xs text-warm-gray mb-1">Setup</div>
        <h1 className="text-2xl font-serif text-ink">{locationName}</h1>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-8">
        {steps.map((step, i) => (
          <div key={step} className="flex items-center gap-2">
            {i > 0 && <div className="w-8 h-px bg-warm-border" />}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs transition-colors ${
              i === currentStepIndex
                ? 'bg-ink text-cream'
                : i < currentStepIndex
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-warm-light text-warm-gray'
            }`}>
              <span className="font-mono text-[10px]">{i + 1}</span>
              <span>{stepLabels[step]}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="border border-warm-border rounded-xl p-6">
        {currentStep === 'intake' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-serif text-ink mb-1">Business Details</h2>
              <p className="text-xs text-warm-gray">
                Before the agent can optimize this location, we need key business details — services, keywords, hours, and more.
              </p>
            </div>

            <div className="bg-warm-light/50 border border-warm-border rounded-lg p-5 space-y-3">
              <div className="text-sm font-medium text-ink">What you will provide:</div>
              <ul className="space-y-2 text-sm text-warm-gray">
                {['Business name, address, and contact info', 'Services and service descriptions', 'Target keywords and cities', 'Hours of operation', 'Brand voice preferences', 'Logo and photos'].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-warm-border mt-1.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-end pt-4">
              <a
                href={`/admin/${orgSlug}/locations/${locationId}/intake?returnTo=setup`}
                className="px-6 py-2 bg-ink text-cream text-sm font-medium rounded-full hover:bg-ink/90 transition-colors no-underline"
              >
                Start Intake Form
              </a>
            </div>
          </div>
        )}

        {currentStep === 'brand' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-serif text-ink mb-1">Brand Voice</h2>
              <p className="text-xs text-warm-gray">
                Configure how AI-generated content sounds for this organization. This applies to all locations.
              </p>
            </div>

            {/* Personality */}
            <div>
              <label className="text-sm font-medium text-ink block mb-2">Personality</label>
              <div className="flex flex-wrap gap-2">
                {PERSONALITY_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setPersonality(personality === opt ? '' : opt)}
                    className={`text-sm rounded-full px-4 py-2 border transition-colors ${
                      personality === opt
                        ? 'bg-ink text-cream border-ink'
                        : 'bg-cream text-ink border-warm-border hover:border-ink/40'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* Tone */}
            <div>
              <label className="text-sm font-medium text-ink block mb-2">
                Tone <span className="text-warm-gray font-normal">(up to 2)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {TONE_OPTIONS.map((opt) => {
                  const selected = tone.includes(opt)
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        if (selected) setTone(tone.filter((t) => t !== opt))
                        else if (tone.length < 2) setTone([...tone, opt])
                      }}
                      className={`text-sm rounded-full px-4 py-2 border transition-colors ${
                        selected
                          ? 'bg-ink text-cream border-ink'
                          : tone.length >= 2
                            ? 'bg-cream/50 text-warm-gray border-warm-border/50 cursor-not-allowed'
                            : 'bg-cream text-ink border-warm-border hover:border-ink/40'
                      }`}
                    >
                      {opt}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Formality */}
            <div>
              <label className="text-sm font-medium text-ink block mb-2">Formality</label>
              <div className="flex flex-wrap gap-2">
                {FORMALITY_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setFormality(formality === opt ? '' : opt)}
                    className={`text-sm rounded-full px-4 py-2 border transition-colors ${
                      formality === opt
                        ? 'bg-ink text-cream border-ink'
                        : 'bg-cream text-ink border-warm-border hover:border-ink/40'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-4">
              <div />
              <button
                onClick={saveBrandAndNext}
                disabled={saving}
                className="px-6 py-2 bg-ink text-cream text-sm font-medium rounded-full hover:bg-ink/90 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Next'}
              </button>
            </div>
          </div>
        )}

        {currentStep === 'agent' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-serif text-ink mb-1">Agent Setup</h2>
              <p className="text-xs text-warm-gray">
                Configure how the AI agent operates for this location. You can change these anytime.
              </p>
            </div>

            {/* Enable toggle */}
            <div className="flex items-center justify-between py-3 border-b border-warm-border">
              <div>
                <div className="text-sm font-medium text-ink">Enable Agent</div>
                <div className="text-xs text-warm-gray">Allow the agent to monitor and act on this location</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={agentEnabled}
                onClick={() => setAgentEnabled(!agentEnabled)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  agentEnabled ? 'bg-emerald-500' : 'bg-warm-gray/30'
                }`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  agentEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </button>
            </div>

            {/* Trust levels */}
            {agentEnabled && (
              <div className="space-y-6">
                <div className="space-y-3">
                  {([
                    { label: 'Review Replies', value: reviewReplies, set: setReviewReplies },
                    { label: 'Post Publishing', value: postPublishing, set: setPostPublishing },
                  ]).map(({ label, value, set }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-sm text-ink">{label}</span>
                      <div className="flex gap-1">
                        {TRUST_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => set(opt.value)}
                            title={opt.desc}
                            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                              value === opt.value
                                ? 'bg-ink text-cream border-ink'
                                : 'bg-white text-warm-gray border-warm-border hover:border-ink hover:text-ink'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="text-xs font-medium text-ink uppercase tracking-wider mb-3">Profile Updates</div>
                  <div className="space-y-3">
                    {PROFILE_SKILL_LABELS.map(({ key, label }) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-sm text-ink">{label}</span>
                        <div className="flex gap-1">
                          {TRUST_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => setProfileSkills((prev) => ({ ...prev, [key]: opt.value }))}
                              title={opt.desc}
                              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                                profileSkills[key] === opt.value
                                  ? 'bg-ink text-cream border-ink'
                                  : 'bg-white text-warm-gray border-warm-border hover:border-ink hover:text-ink'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-4">
              <button
                onClick={goBack}
                className="text-sm text-warm-gray hover:text-ink transition-colors"
              >
                Back
              </button>
              <button
                onClick={saveAgentAndNext}
                disabled={saving}
                className="px-6 py-2 bg-ink text-cream text-sm font-medium rounded-full hover:bg-ink/90 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Next'}
              </button>
            </div>
          </div>
        )}

        {currentStep === 'review' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-serif text-ink mb-1">Pipeline Status</h2>
              <p className="text-xs text-warm-gray">
                Your location is being set up. The pipeline runs automatically in the background.
              </p>
            </div>

            {/* Audit score */}
            {auditScore !== null && (
              <div className="bg-ink rounded-xl p-5 text-center">
                <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Audit Score</div>
                <div className={`text-3xl font-bold font-mono ${
                  auditScore >= 80 ? 'text-emerald-400' :
                  auditScore >= 50 ? 'text-amber-400' :
                  'text-red-400'
                }`}>
                  {auditScore}
                </div>
              </div>
            )}

            {/* Pipeline stages */}
            <div className="space-y-3">
              {stages.map((stage) => (
                <div key={stage.id} className="border border-warm-border rounded-lg overflow-hidden">
                  <div className={`px-4 py-3 flex items-center justify-between ${
                    stage.status === 'completed' ? 'bg-emerald-50' :
                    stage.status === 'active' ? 'bg-amber-50' :
                    stage.status === 'failed' ? 'bg-red-50' :
                    'bg-warm-light/30'
                  }`}>
                    <span className="text-sm font-medium text-ink">{stage.label}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                      stage.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                      stage.status === 'active' ? 'bg-amber-100 text-amber-700' :
                      stage.status === 'failed' ? 'bg-red-100 text-red-700' :
                      'bg-warm-light text-warm-gray'
                    }`}>
                      {stage.status === 'completed' ? 'Done' :
                       stage.status === 'active' ? 'In Progress' :
                       stage.status === 'failed' ? 'Failed' :
                       'Pending'}
                    </span>
                  </div>
                  <div className="px-4 py-2 space-y-1">
                    {stage.phases.map((p) => (
                      <div key={p.phase} className="flex items-center gap-2 text-xs">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          p.status === 'completed' ? 'bg-emerald-500' :
                          p.status === 'running' ? 'bg-amber-500' :
                          p.status === 'failed' ? 'bg-red-500' :
                          p.status === 'skipped' ? 'bg-warm-gray/30' :
                          'bg-warm-border'
                        }`} />
                        <span className={p.status === 'completed' || p.status === 'skipped' ? 'text-warm-gray' : 'text-ink'}>
                          {p.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                onClick={goBack}
                className="text-sm text-warm-gray hover:text-ink transition-colors"
              >
                Back
              </button>
              <button
                onClick={goNext}
                className="px-6 py-2 bg-ink text-cream text-sm font-medium rounded-full hover:bg-ink/90 transition-colors"
              >
                Finish
              </button>
            </div>
          </div>
        )}

        {currentStep === 'done' && (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">
              <svg className="w-12 h-12 mx-auto text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h2 className="text-lg font-serif text-ink mb-2">Setup Complete</h2>
            <p className="text-sm text-warm-gray mb-6">
              {locationName} is configured and the pipeline is running. You can adjust settings anytime from the location detail page.
            </p>
            <button
              onClick={finish}
              disabled={launching}
              className="px-6 py-2 bg-ink text-cream text-sm font-medium rounded-full hover:bg-ink/90 transition-colors disabled:opacity-50"
            >
              {launching ? 'Launching Agent...' : 'Go to Location'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
