import { getOrgBySlug } from '@/lib/org'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { PostReviewClient } from '@/components/post-review'

export const dynamic = 'force-dynamic'

export default async function PostReviewPage({
  params,
}: {
  params: { orgSlug: string }
}) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const org = await getOrgBySlug(params.orgSlug)

  const adminClient = createAdminClient()

  // Get all posts in client_review status for this org's locations
  const { data: locations } = await adminClient
    .from('locations')
    .select('id, name, city, state')
    .eq('org_id', org.id)
    .eq('active', true)

  if (!locations || locations.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-serif text-ink mb-2">Post Review</h1>
        <p className="text-sm text-warm-gray">No locations found.</p>
      </div>
    )
  }

  const locationIds = locations.map((l) => l.id)
  const locationMap = new Map(locations.map((l) => [l.id, l]))

  const { data: posts } = await adminClient
    .from('gbp_post_queue')
    .select('id, location_id, topic_type, summary, media_url, scheduled_for, status, created_at')
    .in('location_id', locationIds)
    .eq('status', 'client_review')
    .order('scheduled_for', { ascending: true })

  // Get GBP profiles for business names
  const { data: profiles } = await adminClient
    .from('gbp_profiles')
    .select('location_id, business_name')
    .in('location_id', locationIds)

  const profileMap = new Map((profiles || []).map((p) => [p.location_id, p]))

  const postsWithLocation = (posts || []).map((post) => {
    const loc = locationMap.get(post.location_id)
    const profile = profileMap.get(post.location_id)
    return {
      ...post,
      location_name: loc?.name || 'Unknown',
      business_name: profile?.business_name || loc?.name || 'Business',
      city: loc?.city || null,
      state: loc?.state || null,
    }
  })

  // Group by location for multi-location orgs
  const groupedByLocation = new Map<string, typeof postsWithLocation>()
  for (const post of postsWithLocation) {
    if (!groupedByLocation.has(post.location_id)) {
      groupedByLocation.set(post.location_id, [])
    }
    groupedByLocation.get(post.location_id)!.push(post)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-serif text-ink">Posts for Review</h1>
        <p className="text-sm text-warm-gray mt-1">
          {postsWithLocation.length === 0
            ? 'No posts pending your review.'
            : `${postsWithLocation.length} post${postsWithLocation.length === 1 ? '' : 's'} ready for your approval.`}
        </p>
      </div>

      {postsWithLocation.length === 0 ? (
        <div className="border border-warm-border rounded-xl p-12 text-center text-warm-gray text-sm">
          All caught up. No posts need your review right now.
        </div>
      ) : (
        <PostReviewClient
          posts={postsWithLocation}
          orgSlug={params.orgSlug}
        />
      )}
    </div>
  )
}
