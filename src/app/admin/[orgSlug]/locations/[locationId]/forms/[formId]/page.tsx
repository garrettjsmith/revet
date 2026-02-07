import { createServerSupabase } from '@/lib/supabase/server'
import { getOrgBySlug } from '@/lib/org'
import { getLocation } from '@/lib/locations'
import { FormBuilder } from '@/components/form-builder'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { FormTemplate, FormSubmission } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function EditFormPage({
  params,
}: {
  params: { orgSlug: string; locationId: string; formId: string }
}) {
  const org = await getOrgBySlug(params.orgSlug)
  const location = await getLocation(params.locationId, org.id)
  if (!location) notFound()

  const supabase = createServerSupabase()
  const basePath = `/admin/${params.orgSlug}/locations/${params.locationId}`

  const { data: form } = await supabase
    .from('form_templates')
    .select('*')
    .eq('id', params.formId)
    .eq('org_id', org.id)
    .single()

  if (!form) notFound()

  // Fetch recent submissions
  const { data: submissions } = await supabase
    .from('form_submissions')
    .select('*')
    .eq('form_id', form.id)
    .order('created_at', { ascending: false })
    .limit(25)

  const recentSubmissions = (submissions || []) as FormSubmission[]
  const formTemplate = form as FormTemplate

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Link
          href={`${basePath}/forms`}
          className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
        >
          Forms
        </Link>
        <span className="text-xs text-warm-gray">/</span>
      </div>
      <h1 className="text-2xl font-serif text-ink mb-6">
        Edit: {form.name}
      </h1>

      <FormBuilder
        form={formTemplate}
        orgId={org.id}
        orgSlug={params.orgSlug}
        locationId={location.id}
      />

      {/* Recent submissions */}
      <div className="mt-8 border border-warm-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-warm-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Recent Submissions</h2>
          <span className="text-xs text-warm-gray font-mono">{recentSubmissions.length} shown</span>
        </div>
        {recentSubmissions.length === 0 ? (
          <div className="p-12 text-center text-warm-gray text-sm">
            No submissions yet. Share the form URL to start collecting responses.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-warm-border">
                  <th className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium">
                    Date
                  </th>
                  {formTemplate.fields.slice(0, 4).map((field) => (
                    <th key={field.id} className="text-left px-5 py-3 text-[11px] text-warm-gray uppercase tracking-wider font-medium">
                      {field.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentSubmissions.map((sub) => (
                  <tr key={sub.id} className="border-b border-warm-border/50 hover:bg-warm-light/50">
                    <td className="px-5 py-3 text-xs text-warm-gray whitespace-nowrap">
                      {new Date(sub.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </td>
                    {formTemplate.fields.slice(0, 4).map((field) => (
                      <td key={field.id} className="px-5 py-3 text-xs text-ink max-w-[200px] truncate">
                        {sub.data[field.id] || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
