import { getOrgBySlug } from '@/lib/org'
import { checkAgencyAdmin } from '@/lib/locations'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { TopicPool } from '@/components/topic-pool'

export const dynamic = 'force-dynamic'

export default async function TopicPoolPage({
  params,
}: {
  params: { orgSlug: string; locationId: string }
}) {
  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) redirect(`/admin/${params.orgSlug}`)

  const org = await getOrgBySlug(params.orgSlug)

  const supabase = createAdminClient()
  const { data: location } = await supabase
    .from('locations')
    .select('id, name, posts_per_month')
    .eq('id', params.locationId)
    .eq('org_id', org.id)
    .single()

  if (!location) notFound()

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Link
            href={`/admin/${params.orgSlug}`}
            className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
          >
            {org.name}
          </Link>
          <span className="text-xs text-warm-gray">/</span>
          <Link
            href={`/admin/${params.orgSlug}/locations/${params.locationId}`}
            className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
          >
            {location.name}
          </Link>
          <span className="text-xs text-warm-gray">/</span>
        </div>
        <h1 className="text-2xl font-serif text-ink">Post Topics</h1>
        <p className="text-sm text-warm-gray mt-1">
          AI-generated topic pool for Google Business Profile posts.
          {location.posts_per_month > 0
            ? ` ${location.posts_per_month} post${location.posts_per_month === 1 ? '' : 's'}/month.`
            : ' Posts not configured for this location.'}
        </p>
      </div>

      <div className="border border-warm-border rounded-xl p-6">
        <TopicPool locationId={params.locationId} />
      </div>
    </div>
  )
}
