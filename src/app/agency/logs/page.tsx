import { createAdminClient } from '@/lib/supabase/admin'
import { requireAgencyAdmin } from '@/lib/locations'

export const dynamic = 'force-dynamic'

const STATUS_STYLES: Record<string, string> = {
  completed: 'text-emerald-700 bg-emerald-50',
  queued: 'text-amber-700 bg-amber-50',
  failed: 'text-red-700 bg-red-50',
  escalated: 'text-purple-700 bg-purple-50',
}

const ACTION_LABELS: Record<string, string> = {
  review_reply: 'Review Reply',
  description_optimization: 'Description',
  attribute_update: 'Attributes',
  photo_suggestion: 'Photos',
  post_promotion: 'Post Promotion',
  post_creation: 'Post Creation',
  category_update: 'Categories',
  hours_update: 'Hours',
}

export default async function AgencyLogsPage() {
  await requireAgencyAdmin()
  const adminClient = createAdminClient()

  // Fetch recent activity across all locations
  const { data: activity } = await adminClient
    .from('agent_activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  // Fetch location + org info for the activity entries
  const locationIds = Array.from(new Set((activity || []).map((a: any) => a.location_id)))
  let locationMap = new Map<string, { name: string; orgName: string; orgSlug: string }>()

  if (locationIds.length > 0) {
    const { data: locations } = await adminClient
      .from('locations')
      .select('id, name, org_id, organizations(name, slug)')
      .in('id', locationIds)

    for (const loc of locations || []) {
      const org = (loc as any).organizations
      locationMap.set(loc.id, {
        name: loc.name,
        orgName: org?.name || 'Unknown',
        orgSlug: org?.slug || '',
      })
    }
  }

  // Group by date
  const grouped = new Map<string, typeof activity>()
  for (const entry of activity || []) {
    const dateKey = new Date(entry.created_at).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
    if (!grouped.has(dateKey)) grouped.set(dateKey, [])
    grouped.get(dateKey)!.push(entry)
  }

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-6">Logs</h1>

      {(activity || []).length === 0 ? (
        <div className="text-center py-16 text-sm text-warm-gray">
          No agent activity recorded yet.
        </div>
      ) : (
        <div className="space-y-8">
          {Array.from(grouped.entries()).map(([dateKey, entries]) => (
            <div key={dateKey}>
              <h3 className="text-xs font-medium text-warm-gray uppercase tracking-wider mb-3">{dateKey}</h3>
              <div className="border border-warm-border rounded-xl overflow-hidden">
                <div className="divide-y divide-warm-border/50">
                  {entries!.map((entry: any) => {
                    const loc = locationMap.get(entry.location_id)
                    return (
                      <div key={entry.id} className="px-4 py-3 flex items-start gap-3 hover:bg-warm-light/20 transition-colors">
                        <div className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                          entry.status === 'completed' ? 'bg-emerald-500' :
                          entry.status === 'queued' ? 'bg-amber-500' :
                          entry.status === 'failed' ? 'bg-red-500' :
                          'bg-purple-500'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_STYLES[entry.status] || 'text-warm-gray bg-warm-light'}`}>
                              {entry.status}
                            </span>
                            <span className="text-[10px] text-warm-gray bg-warm-light px-2 py-0.5 rounded-full">
                              {ACTION_LABELS[entry.action_type] || entry.action_type}
                            </span>
                          </div>
                          <p className="text-sm text-ink mt-1">{entry.summary}</p>
                          {loc && (
                            <p className="text-[10px] text-warm-gray mt-0.5">
                              {loc.name} · {loc.orgName}
                            </p>
                          )}
                        </div>
                        <span className="text-[10px] text-warm-gray shrink-0">
                          {new Date(entry.created_at).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
