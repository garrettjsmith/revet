import { createServerSupabase } from '@/lib/supabase/server'
import { getOrgBySlug } from '@/lib/org'
import Link from 'next/link'
import type { FormTemplate } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function OrgFormsPage({
  params,
}: {
  params: { orgSlug: string }
}) {
  const org = await getOrgBySlug(params.orgSlug)
  const supabase = createServerSupabase()

  // Get all forms for this org (across all locations)
  const { data: forms } = await supabase
    .from('form_templates')
    .select('*, locations(name)')
    .eq('org_id', org.id)
    .order('created_at', { ascending: false })

  const formList = (forms || []) as (FormTemplate & { locations?: { name: string } | null })[]

  // Get submission counts
  const formIds = formList.map((f) => f.id)
  let submissionCounts: Record<string, number> = {}
  if (formIds.length > 0) {
    const { data: counts } = await supabase
      .from('form_submissions')
      .select('form_id')
      .in('form_id', formIds)

    if (counts) {
      submissionCounts = counts.reduce((acc: Record<string, number>, row: { form_id: string }) => {
        acc[row.form_id] = (acc[row.form_id] || 0) + 1
        return acc
      }, {})
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif text-ink">Forms</h1>
        <span className="text-xs text-warm-gray">
          {formList.length} form{formList.length !== 1 ? 's' : ''} across all locations
        </span>
      </div>

      <div className="border border-warm-border rounded-xl overflow-hidden">
        {formList.length === 0 ? (
          <div className="p-12 text-center text-warm-gray text-sm">
            No forms yet. Create a form from any location&apos;s detail page.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-warm-border">
                {['Form', 'Location', 'URL', 'Submissions', 'Alert', 'Status', ''].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {formList.map((f) => (
                <tr key={f.id} className="border-b border-warm-border/50 hover:bg-warm-light/50">
                  <td className="px-5 py-3.5">
                    <div className="text-sm font-medium text-ink">{f.name}</div>
                    {f.description && (
                      <div className="text-xs text-warm-gray mt-0.5">{f.description}</div>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-warm-gray">
                    {f.locations?.name || '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <code className="text-xs text-ink font-mono">/f/{f.slug}</code>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-sm text-ink">
                    {submissionCounts[f.id] || 0}
                  </td>
                  <td className="px-5 py-3.5">
                    {f.alert_enabled && f.alert_email ? (
                      <span className="text-xs text-warm-gray">{f.alert_email}</span>
                    ) : (
                      <span className="text-xs text-warm-gray/50">Off</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${
                      f.active ? 'text-emerald-600' : 'text-warm-gray'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        f.active ? 'bg-emerald-500' : 'bg-warm-border'
                      }`} />
                      {f.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    {f.location_id ? (
                      <Link
                        href={`/admin/${params.orgSlug}/locations/${f.location_id}/forms/${f.id}`}
                        className="text-xs text-warm-gray hover:text-ink no-underline"
                      >
                        Edit
                      </Link>
                    ) : (
                      <span className="text-xs text-warm-gray/50">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
