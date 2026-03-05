'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import Link from 'next/link'
import {
  PHASE_ORDER,
  PHASE_LABELS,
  PHASE_DESCRIPTIONS,
  PIPELINE_STAGES,
  getStageStatus,
  getNextActionPhase,
  type SetupPhase,
  type PhaseStatus,
  type PhaseRecord,
  type StageDefinition,
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
  const statusMap = useMemo(
    () => new Map<SetupPhase, PhaseRecord>(phases.map((p) => [p.phase, p])),
    [phases]
  )
  const phaseStatusMap = useMemo(
    () => new Map<SetupPhase, PhaseStatus>(phases.map((p) => [p.phase, p.status])),
    [phases]
  )

  // Auto-expand the active stage (first non-completed stage)
  const activeStageId = useMemo(() => {
    for (const stage of PIPELINE_STAGES) {
      const status = getStageStatus(stage, phaseStatusMap)
      if (status !== 'completed') return stage.id
    }
    return null
  }, [phaseStatusMap])

  const [expandedStage, setExpandedStage] = useState<string | null>(activeStageId)

  // Keep expanded stage in sync when pipeline advances to a new stage
  useEffect(() => {
    if (activeStageId) setExpandedStage(activeStageId)
  }, [activeStageId])

  const nextAction = useMemo(() => getNextActionPhase(phases), [phases])
  const completedCount = useMemo(
    () => phases.filter((p) => p.phase !== 'complete' && (p.status === 'completed' || p.status === 'skipped')).length,
    [phases]
  )
  const totalActionPhases = phases.filter((p) => p.phase !== 'complete').length

  const [error, setError] = useState<string | null>(null)
  const [advancing, setAdvancing] = useState(false)

  const handleAction = useCallback(async (action: string, phase?: SetupPhase) => {
    if (phase) setLoading(phase)
    else setAdvancing(true)
    setError(null)
    try {
      const res = await fetch(`/api/locations/${locationId}/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, phase }),
      })
      if (res.ok) {
        const data = await res.json()
        setPhases(data.phases)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || `Action failed (${res.status})`)
      }
    } catch {
      setError('Network error — check your connection')
    }
    setLoading(null)
    setAdvancing(false)
  }, [locationId])

  const locationPath = `/admin/${orgSlug}/locations/${locationId}`

  // If fully complete, show minimal success state
  if (progress === 100) {
    return (
      <div className="border border-emerald-200 bg-emerald-50/50 rounded-xl px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <span className="text-sm font-semibold text-emerald-800">Setup Complete</span>
              <p className="text-xs text-emerald-600">All 11 onboarding steps finished</p>
            </div>
          </div>
          <StageDotsCompact phases={phases} />
        </div>
      </div>
    )
  }

  return (
    <div className="border border-warm-border rounded-xl overflow-hidden">
      {/* Header: summary + progress */}
      <div className="px-5 py-4 border-b border-warm-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">Setup Pipeline</h3>
            <p className="text-xs text-warm-gray mt-0.5">
              {completedCount} of {totalActionPhases} complete
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ProgressRing progress={progress} />
            {isAgencyAdmin && (
              <button
                onClick={() => handleAction('advance')}
                disabled={advancing}
                className="text-xs px-3 py-1.5 bg-ink text-cream rounded-full hover:bg-ink/90 transition-colors disabled:opacity-50"
              >
                {advancing ? 'Advancing...' : 'Advance'}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="text-xs text-red-500 mt-2 px-1">{error}</div>
        )}

        {/* Stage progress bar — 4 segments */}
        <div className="flex gap-1">
          {PIPELINE_STAGES.map((stage) => {
            const stageStatus = getStageStatus(stage, phaseStatusMap)
            return (
              <div key={stage.id} className="flex-1">
                <div className={`h-1.5 rounded-full ${
                  stageStatus === 'completed' ? 'bg-emerald-500' :
                  stageStatus === 'active' ? 'bg-ink' :
                  stageStatus === 'failed' ? 'bg-red-400' :
                  'bg-warm-border'
                }`} />
                <span className={`block text-[10px] mt-1 text-center ${
                  stageStatus === 'active' ? 'text-ink font-medium' : 'text-warm-gray'
                }`}>
                  {stage.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Next Action CTA */}
      {nextAction && (
        <NextActionCard
          phase={nextAction}
          record={statusMap.get(nextAction) || null}
          locationPath={locationPath}
          isAgencyAdmin={isAgencyAdmin}
          isLoading={loading === nextAction}
          onRetry={() => handleAction('retry', nextAction)}
          onSkip={() => handleAction('skip', nextAction)}
        />
      )}

      {/* Stage groups — collapsed by default, expand to show individual phases */}
      <div className="divide-y divide-warm-border">
        {PIPELINE_STAGES.map((stage) => {
          const stageStatus = getStageStatus(stage, phaseStatusMap)
          const isExpanded = expandedStage === stage.id

          return (
            <StageGroup
              key={stage.id}
              stage={stage}
              stageStatus={stageStatus}
              isExpanded={isExpanded}
              onToggle={() => setExpandedStage(isExpanded ? null : stage.id)}
              statusMap={statusMap}
              phaseStatusMap={phaseStatusMap}
              loading={loading}
              isAgencyAdmin={isAgencyAdmin}
              locationPath={locationPath}
              nextAction={nextAction}
              onRetry={(phase) => handleAction('retry', phase)}
              onSkip={(phase) => handleAction('skip', phase)}
            />
          )
        })}
      </div>
    </div>
  )
}

// --- Next Action Card ---

function NextActionCard({
  phase,
  record,
  locationPath,
  isAgencyAdmin,
  isLoading,
  onRetry,
  onSkip,
}: {
  phase: SetupPhase
  record: PhaseRecord | null
  locationPath: string
  isAgencyAdmin: boolean
  isLoading: boolean
  onRetry: () => void
  onSkip: () => void
}) {
  const status = record?.status || 'pending'
  const isFailed = status === 'failed'
  const phaseLink = getPhaseLink(phase, locationPath)

  const actionLabel = isFailed ? 'Retry this step' :
    status === 'running' ? 'In progress...' :
    getNextActionLabel(phase)

  return (
    <div className={`px-5 py-4 border-b border-warm-border ${
      isFailed ? 'bg-red-50/50' : 'bg-cream/50'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
            isFailed ? 'bg-red-100' :
            status === 'running' ? 'bg-amber-100' :
            'bg-ink/5'
          }`}>
            {status === 'running' || isLoading ? (
              <div className="w-4 h-4 rounded-full border-2 border-ink border-t-transparent animate-spin" />
            ) : isFailed ? (
              <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-ink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 8 12 12 14 14" />
              </svg>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-xs text-warm-gray uppercase tracking-wider">Next step</div>
            <div className="text-sm font-medium text-ink">{PHASE_LABELS[phase]}</div>
            {isFailed && record?.error && (
              <p className="text-xs text-red-500 mt-0.5 truncate">{record.error}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isAgencyAdmin && status === 'pending' && phase !== 'complete' && (
            <button
              onClick={onSkip}
              disabled={isLoading}
              className="text-xs text-warm-gray hover:text-ink transition-colors disabled:opacity-50"
            >
              Skip
            </button>
          )}
          {isFailed && isAgencyAdmin ? (
            <button
              onClick={onRetry}
              disabled={isLoading}
              className="text-xs px-4 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              Retry
            </button>
          ) : phaseLink && status !== 'running' ? (
            <Link
              href={phaseLink}
              className="text-xs px-4 py-2 bg-ink text-cream rounded-full hover:bg-ink/90 no-underline transition-colors"
            >
              {actionLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// --- Stage Group ---

function StageGroup({
  stage,
  stageStatus,
  isExpanded,
  onToggle,
  statusMap,
  phaseStatusMap,
  loading,
  isAgencyAdmin,
  locationPath,
  nextAction,
  onRetry,
  onSkip,
}: {
  stage: StageDefinition
  stageStatus: 'completed' | 'active' | 'failed' | 'pending'
  isExpanded: boolean
  onToggle: () => void
  statusMap: Map<SetupPhase, PhaseRecord>
  phaseStatusMap: Map<SetupPhase, PhaseStatus>
  loading: SetupPhase | null
  isAgencyAdmin: boolean
  locationPath: string
  nextAction: SetupPhase | null
  onRetry: (phase: SetupPhase) => void
  onSkip: (phase: SetupPhase) => void
}) {
  const doneCount = stage.phases.filter((p) => {
    const s = phaseStatusMap.get(p) || 'pending'
    return s === 'completed' || s === 'skipped'
  }).length

  return (
    <div>
      {/* Stage header — always visible */}
      <button
        onClick={onToggle}
        className="w-full px-5 py-3 flex items-center gap-3 hover:bg-warm-light/30 transition-colors text-left"
      >
        {/* Status indicator */}
        <div className="flex-shrink-0">
          {stageStatus === 'completed' ? (
            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
              <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          ) : stageStatus === 'failed' ? (
            <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
              <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
          ) : stageStatus === 'active' ? (
            <div className="w-5 h-5 rounded-full border-2 border-ink flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-ink" />
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full border-2 border-warm-border" />
          )}
        </div>

        {/* Label + count */}
        <div className="flex-1 min-w-0">
          <span className={`text-sm font-medium ${
            stageStatus === 'completed' ? 'text-warm-gray' :
            stageStatus === 'active' ? 'text-ink' :
            'text-warm-gray'
          }`}>
            {stage.label}
          </span>
          <span className="text-xs text-warm-gray ml-2">
            {doneCount}/{stage.phases.length}
          </span>
        </div>

        {/* Phase dots for quick scan */}
        <div className="flex gap-1 mr-2">
          {stage.phases.map((phase) => {
            const s = phaseStatusMap.get(phase) || 'pending'
            return (
              <div
                key={phase}
                className={`w-1.5 h-1.5 rounded-full ${
                  s === 'completed' || s === 'skipped' ? 'bg-emerald-500' :
                  s === 'running' ? 'bg-amber-400' :
                  s === 'failed' ? 'bg-red-500' :
                  'bg-warm-border'
                }`}
              />
            )
          })}
        </div>

        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-warm-gray transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expanded phase list */}
      {isExpanded && (
        <div className="border-t border-warm-border/50 bg-cream/20">
          {stage.phases.map((phase) => {
            const record = statusMap.get(phase)
            const status = record?.status || 'pending'
            const isNext = phase === nextAction

            return (
              <PhaseRow
                key={phase}
                phase={phase}
                status={status}
                error={record?.error || null}
                completedAt={record?.completed_at || null}
                isLoading={loading === phase}
                isAgencyAdmin={isAgencyAdmin}
                isNext={isNext}
                locationPath={locationPath}
                onRetry={() => onRetry(phase)}
                onSkip={() => onSkip(phase)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// --- Phase Row (within expanded stage) ---

function PhaseRow({
  phase,
  status,
  error,
  completedAt,
  isLoading,
  isAgencyAdmin,
  isNext,
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
  isNext: boolean
  locationPath: string
  onRetry: () => void
  onSkip: () => void
}) {
  const label = PHASE_LABELS[phase]
  const description = PHASE_DESCRIPTIONS[phase]
  const phaseLink = getPhaseLink(phase, locationPath)
  const isDone = status === 'completed' || status === 'skipped'

  return (
    <div className={`pl-12 pr-5 py-2.5 flex items-start gap-3 ${
      isDone ? 'opacity-50' : isNext ? '' : ''
    }`}>
      <div className="mt-0.5 flex-shrink-0">
        <PhaseStatusIcon status={status} isLoading={isLoading} size="small" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${isDone ? 'line-through text-warm-gray' : 'text-ink'}`}>
            {label}
          </span>
          {isNext && !isDone && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-ink/5 text-ink font-medium uppercase tracking-wider">
              Next
            </span>
          )}
          {status === 'running' && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Running</span>
          )}
          {status === 'failed' && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Failed</span>
          )}
          {status === 'skipped' && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Skipped</span>
          )}
        </div>
        <p className="text-[11px] text-warm-gray mt-0.5">{description}</p>
        {error && <p className="text-[11px] text-red-500 mt-0.5">{error}</p>}
        {completedAt && isDone && (
          <p className="text-[10px] text-warm-gray mt-0.5">
            {status === 'skipped' ? 'Skipped' : 'Completed'} {new Date(completedAt).toLocaleDateString()}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {phaseLink && !isDone && (
          <a
            href={phaseLink}
            className="text-[11px] text-warm-gray hover:text-ink transition-colors"
          >
            View
          </a>
        )}
        {isAgencyAdmin && status === 'failed' && (
          <button
            onClick={onRetry}
            disabled={isLoading}
            className="text-[11px] text-amber-600 hover:text-amber-700 transition-colors disabled:opacity-50"
          >
            Retry
          </button>
        )}
        {isAgencyAdmin && status === 'pending' && phase !== 'complete' && (
          <button
            onClick={onSkip}
            disabled={isLoading}
            className="text-[11px] text-warm-gray hover:text-ink transition-colors disabled:opacity-50"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  )
}

// --- Shared helpers ---

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

function getNextActionLabel(phase: SetupPhase): string {
  switch (phase) {
    case 'gbp_connect': return 'Connect GBP'
    case 'intake': return 'Start Intake'
    case 'optimization': return 'Review Changes'
    default: return 'Continue'
  }
}

function PhaseStatusIcon({ status, isLoading, size = 'normal' }: { status: PhaseStatus; isLoading: boolean; size?: 'normal' | 'small' }) {
  const dim = size === 'small' ? 'w-4 h-4' : 'w-5 h-5'
  const iconDim = size === 'small' ? 'w-2.5 h-2.5' : 'w-3 h-3'

  if (isLoading) {
    return <div className={`${dim} rounded-full border-2 border-ink border-t-transparent animate-spin`} />
  }

  switch (status) {
    case 'completed':
      return (
        <div className={`${dim} rounded-full bg-emerald-500 flex items-center justify-center`}>
          <svg className={`${iconDim} text-white`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      )
    case 'running':
      return <div className={`${dim} rounded-full border-2 border-ink border-t-transparent animate-spin`} />
    case 'failed':
      return (
        <div className={`${dim} rounded-full bg-red-500 flex items-center justify-center`}>
          <svg className={`${iconDim} text-white`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
      )
    case 'skipped':
      return (
        <div className={`${dim} rounded-full bg-warm-border flex items-center justify-center`}>
          <svg className={`${iconDim} text-warm-gray`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </div>
      )
    default:
      return <div className={`${dim} rounded-full border-2 border-warm-border`} />
  }
}

function ProgressRing({ progress }: { progress: number }) {
  return (
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
  )
}

function StageDotsCompact({ phases }: { phases: PhaseRecord[] }) {
  const phaseStatusMap = new Map<SetupPhase, PhaseStatus>(phases.map((p) => [p.phase, p.status]))

  return (
    <div className="flex gap-2">
      {PIPELINE_STAGES.map((stage) => (
        <div key={stage.id} className="flex gap-0.5">
          {stage.phases.map((phase) => {
            const s = phaseStatusMap.get(phase) || 'pending'
            return (
              <div
                key={phase}
                className={`w-1.5 h-1.5 rounded-full ${
                  s === 'completed' || s === 'skipped' ? 'bg-emerald-400' : 'bg-emerald-200'
                }`}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

/**
 * Compact progress bar for use in tables/lists (org-level rollup).
 */
export function PipelineProgressBar({ phases }: { phases: PhaseRecord[] }) {
  const progress = calculateProgress(phases)

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
