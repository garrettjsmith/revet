import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgBySlug } from '@/lib/org'
import { getLocation, checkAgencyAdmin } from '@/lib/locations'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { ProfileRecommendation } from '@/lib/types'
import { RecommendationActions } from '@/components/recommendation-actions'

export const dynamic = 'force-dynamic'

const FIELD_LABELS: Record<string, string> = {
  description: 'Business Description',
  categories: 'Categories',
  attributes: 'Attributes',
  hours: 'Business Hours',
}

const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  pending: { label: 'Pending Review', classes: 'text-warm-gray bg-warm-light border-warm-border' },
  client_review: { label: 'Awaiting Your Approval', classes: 'text-amber-700 bg-amber-50 border-amber-200' },
  approved: { label: 'Approved', classes: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  applied: { label: 'Applied', classes: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  rejected: { label: 'Declined', classes: 'text-red-700 bg-red-50 border-red-200' },
}

export default async function RecommendationsPage({
  params,
}: {
  params: { orgSlug: string; locationId: string }
}) {
  const org = await getOrgBySlug(params.orgSlug)
  const location = await getLocation(params.locationId, org.id)
  if (!location) notFound()

  const isAdmin = await checkAgencyAdmin()
  const adminClient = createAdminClient()
  const basePath = `/admin/${params.orgSlug}/locations/${params.locationId}`

  const { data: recs } = await adminClient
    .from('profile_recommendations')
    .select('*')
    .eq('location_id', location.id)
    .order('created_at', { ascending: false })

  const recommendations = (recs || []) as ProfileRecommendation[]

  // Group by batch
  const batches = new Map<string, ProfileRecommendation[]>()
  for (const rec of recommendations) {
    const batch = batches.get(rec.batch_id) || []
    batch.push(rec)
    batches.set(rec.batch_id, batch)
  }

  const pendingClientReview = recommendations.filter((r) => r.status === 'client_review')
  const hasPendingApprovals = pendingClientReview.length > 0

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Link
          href={`/admin/${params.orgSlug}/locations`}
          className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
        >
          Locations
        </Link>
        <span className="text-xs text-warm-gray">/</span>
        <Link
          href={basePath}
          className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
        >
          {location.name}
        </Link>
        <span className="text-xs text-warm-gray">/</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-serif text-ink">Profile Recommendations</h1>
          <p className="text-xs text-warm-gray mt-1">
            {hasPendingApprovals
              ? `${pendingClientReview.length} recommendation${pendingClientReview.length !== 1 ? 's' : ''} awaiting your approval`
              : 'AI-generated profile optimization suggestions'}
          </p>
        </div>
      </div>

      {recommendations.length === 0 ? (
        <div className="border border-warm-border rounded-xl p-12 text-center">
          <p className="text-sm text-warm-gray mb-2">No recommendations yet.</p>
          <p className="text-xs text-warm-gray">
            Profile recommendations are generated automatically when optimization opportunities are detected.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(batches.entries()).map(([batchId, batchRecs]) => {
            const batchDate = new Date(batchRecs[0].created_at)
            return (
              <div key={batchId} className="border border-warm-border rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-warm-border bg-warm-light/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-warm-gray">
                      {batchDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span className="text-[10px] text-warm-gray">
                      {batchRecs.length} suggestion{batchRecs.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-warm-border/50">
                  {batchRecs.map((rec) => {
                    const statusConfig = STATUS_CONFIG[rec.status] || STATUS_CONFIG.pending
                    const displayValue = rec.edited_value || rec.proposed_value
                    const isActionable = rec.status === 'client_review'
                    const currentStr = rec.current_value != null
                      ? (typeof rec.current_value === 'string' ? rec.current_value : JSON.stringify(rec.current_value, null, 2))
                      : null
                    const proposedStr = typeof displayValue === 'string'
                      ? displayValue
                      : JSON.stringify(displayValue, null, 2)

                    return (
                      <div key={rec.id} className={`px-5 py-5 ${isActionable ? 'bg-amber-50/20' : ''}`}>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-ink">
                            {FIELD_LABELS[rec.field] || rec.field}
                          </span>
                          <span className={`text-[10px] font-medium px-2.5 py-0.5 rounded-full border ${statusConfig.classes}`}>
                            {statusConfig.label}
                          </span>
                        </div>

                        {/* Current value */}
                        {currentStr && (
                          <div className="mb-3">
                            <div className="text-[10px] text-warm-gray uppercase tracking-wider mb-1">Current</div>
                            <div className="text-xs text-warm-gray leading-relaxed bg-warm-light/50 rounded-lg px-3 py-2">
                              {currentStr}
                            </div>
                          </div>
                        )}

                        {/* Proposed value */}
                        <div className="mb-3">
                          <div className="text-[10px] text-warm-gray uppercase tracking-wider mb-1">
                            {rec.edited_value ? 'Proposed (edited)' : 'Proposed'}
                          </div>
                          <div className={`text-xs leading-relaxed rounded-lg px-3 py-2 ${
                            isActionable
                              ? 'text-ink bg-white border border-warm-border'
                              : 'text-ink bg-warm-light/50'
                          }`}>
                            {proposedStr}
                          </div>
                        </div>

                        {/* AI rationale */}
                        {rec.ai_rationale && (
                          <div className="mb-4">
                            <div className="text-[10px] text-warm-gray uppercase tracking-wider mb-1">Why</div>
                            <p className="text-xs text-warm-gray leading-relaxed">{rec.ai_rationale}</p>
                          </div>
                        )}

                        {/* Action buttons for client_review items */}
                        {isActionable && (
                          <RecommendationActions
                            recommendationId={rec.id}
                            locationId={location.id}
                            isAdmin={isAdmin}
                          />
                        )}

                        {/* Applied timestamp */}
                        {rec.status === 'applied' && rec.applied_at && (
                          <div className="text-[10px] text-warm-gray mt-2">
                            Applied {new Date(rec.applied_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
