'use client'

import { useState, useCallback } from 'react'
import {
  PHASE_ORDER,
  PHASE_LABELS,
  PHASE_DESCRIPTIONS,
  type SetupPhase,
  type PhaseStatus,
  type PhaseRecord,
  calculateProgress,
} from '@/lib/pipeline'

interface SetupPipelineProps {
  locationId: string
  orgSlug: string
  phases: PhaseRecord[]
  isAgencyAdmin: boolean
}

export function SetupPipeline({ locationId, orgSlug, phases: initialPhases, isAgencyAdmin }: SetupPipelineProps) {
  const [phases, setPhases] = useState<PhaseRecord[]>(initialPhases)
  const [loading, setLoading] = useState<SetupPhase | null>(null)

  const progress = calculateProgress(phases)
  const statusMap = new Map<SetupPhase, PhaseRecord>(phases.map((p) => [p.phase, p]))

  const handleAction = useCallback(async (action: string, phase?: SetupPhase) => {
    setLoading(phase || null)
    try {
      const res = await fetch(`/api/locations/${locationId}/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, phase }),
      })
      if (res.ok) {
        const data = await res.json()
        setPhases(data.phases)
      }
    } catch { /* ignore */ }
    setLoading(null)
  }, [locationId])

  const locationPath = `/admin/${orgSlug}/locations/${locationId}`

  return (
    <div className="border border-warm-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-warm-border flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink">Setup Pipeline</h3>
          <p className="text-xs text-warm-gray mt-0.5">{progress}% complete</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Progress ring */}
          <div className="relative w-10 h-10">
            <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-warm-border"
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray={`${progress}, 100`}
                className={progress === 100 ? 'text-emerald-500' : 'text-ink'}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-ink">
              {progress}%
            </span>
          </div>
          {isAgencyAdmin && (
            <button
              onClick={() => handleAction('advance')}
              className="text-xs px-3 py-1.5 bg-ink text-cream rounded-full hover:bg-ink/90 transition-colors"
            >
              Advance
            </button>
          )}
        </div>
      </div>

      {/* Phase list */}
      <div className="divide-y divide-warm-border">
        {PHASE_ORDER.map((phase) => {
          const record = statusMap.get(phase)
          const status = record?.status || 'pending'
          const isLoading = loading === phase

          return (
            <PhaseRow
              key={phase}
              phase={phase}
              status={status}
              error={record?.error || null}
              completedAt={record?.completed_at || null}
              isLoading={isLoading}
              isAgencyAdmin={isAgencyAdmin}
              locationPath={locationPath}
              onRetry={() => handleAction('retry', phase)}
              onSkip={() => handleAction('skip', phase)}
            />
          )
        })}
      </div>
    </div>
  )
}

function PhaseRow({
  phase,
  status,
  error,
  completedAt,
  isLoading,
  isAgencyAdmin,
  locationPath,
  onRetry,
  onSkip,
}: {
  phase: SetupPhase
  status: PhaseStatus
  error: string | null
  completedAt: string | null
  isLoading: boolean
  isAgencyAdmin: boolean
  locationPath: string
  onRetry: () => void
  onSkip: () => void
}) {
  const label = PHASE_LABELS[phase]
  const description = PHASE_DESCRIPTIONS[phase]

  // Phase-specific navigation links
  const phaseLink = getPhaseLink(phase, locationPath)

  return (
    <div className={`px-5 py-3 flex items-start gap-3 ${status === 'completed' || status === 'skipped' ? 'opacity-60' : ''}`}>
      {/* Status indicator */}
      <div className="mt-0.5 flex-shrink-0">
        <PhaseStatusIcon status={status} isLoading={isLoading} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${status === 'completed' ? 'line-through text-warm-gray' : 'text-ink'}`}>
            {label}
          </span>
          <PhaseStatusBadge status={status} />
        </div>
        <p className="text-xs text-warm-gray mt-0.5">{description}</p>
        {error && (
          <p className="text-xs text-red-500 mt-1">{error}</p>
        )}
        {completedAt && status === 'completed' && (
          <p className="text-[10px] text-warm-gray mt-0.5">
            Completed {new Date(completedAt).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {phaseLink && status !== 'completed' && status !== 'skipped' && (
          <a
            href={phaseLink}
            className="text-xs text-warm-gray hover:text-ink transition-colors"
          >
            View
          </a>
        )}
        {isAgencyAdmin && status === 'failed' && (
          <button
            onClick={onRetry}
            disabled={isLoading}
            className="text-xs text-amber-600 hover:text-amber-700 transition-colors disabled:opacity-50"
          >
            Retry
          </button>
        )}
        {isAgencyAdmin && status === 'pending' && phase !== 'complete' && (
          <button
            onClick={onSkip}
            disabled={isLoading}
            className="text-xs text-warm-gray hover:text-ink transition-colors disabled:opacity-50"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  )
}

function getPhaseLink(phase: SetupPhase, locationPath: string): string | null {
  switch (phase) {
    case 'gbp_connect': return '/agency/integrations'
    case 'initial_sync':
    case 'audit': return `${locationPath}/gbp-profile`
    case 'benchmark': return `${locationPath}/reports`
    case 'intake': return `${locationPath}/intake`
    case 'recommendations':
    case 'optimization': return `${locationPath}/recommendations`
    case 'review_setup': return `${locationPath}/reviews`
    case 'citations': return `${locationPath}/citations`
    case 'lander': return `${locationPath}/lander`
    case 'notifications': return `${locationPath}/notifications`
    default: return null
  }
}

function PhaseStatusIcon({ status, isLoading }: { status: PhaseStatus; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="w-5 h-5 rounded-full border-2 border-ink border-t-transparent animate-spin" />
    )
  }

  switch (status) {
    case 'completed':
      return (
        <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
          <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      )
    case 'running':
      return (
        <div className="w-5 h-5 rounded-full border-2 border-ink border-t-transparent animate-spin" />
      )
    case 'failed':
      return (
        <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
          <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
      )
    case 'skipped':
      return (
        <div className="w-5 h-5 rounded-full bg-warm-border flex items-center justify-center">
          <svg className="w-3 h-3 text-warm-gray" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </div>
      )
    default:
      return (
        <div className="w-5 h-5 rounded-full border-2 border-warm-border" />
      )
  }
}

function PhaseStatusBadge({ status }: { status: PhaseStatus }) {
  switch (status) {
    case 'running':
      return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Running</span>
    case 'failed':
      return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Failed</span>
    case 'skipped':
      return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Skipped</span>
    default:
      return null
  }
}

/**
 * Compact progress bar for use in tables/lists (org-level rollup).
 */
export function PipelineProgressBar({ phases }: { phases: PhaseRecord[] }) {
  const progress = calculateProgress(phases)
  const actionPhases = phases.filter((p) => p.phase !== 'complete')

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-warm-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            progress === 100 ? 'bg-emerald-500' : 'bg-ink'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-[10px] text-warm-gray w-7 text-right">{progress}%</span>
    </div>
  )
}

/**
 * Mini phase dots for compact display in tables.
 */
export function PipelineDots({ phases }: { phases: PhaseRecord[] }) {
  const statusMap = new Map(phases.map((p) => [p.phase, p.status]))

  return (
    <div className="flex gap-0.5">
      {PHASE_ORDER.filter((p) => p !== 'complete').map((phase) => {
        const status = statusMap.get(phase) || 'pending'
        let color = 'bg-warm-border'
        if (status === 'completed' || status === 'skipped') color = 'bg-emerald-500'
        else if (status === 'running') color = 'bg-amber-400'
        else if (status === 'failed') color = 'bg-red-500'

        return (
          <div
            key={phase}
            className={`w-1.5 h-1.5 rounded-full ${color}`}
            title={`${PHASE_LABELS[phase]}: ${status}`}
          />
        )
      })}
    </div>
  )
}
