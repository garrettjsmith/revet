import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgBySlug } from '@/lib/org'
import { getLocation, checkAgencyAdmin } from '@/lib/locations'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { GBPProfile, GBPMedia, GBPPost, GBPPostQueue } from '@/lib/types'
import { GBPProfileContent } from '@/components/gbp-profile-content'

export const dynamic = 'force-dynamic'

export default async function GBPProfilePage({
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

  // Fetch GBP profile
  const { data: profile } = await adminClient
    .from('gbp_profiles')
    .select('*')
    .eq('location_id', location.id)
    .single()

  const gbp = profile as GBPProfile | null

  // Fetch media
  const { data: media } = await adminClient
    .from('gbp_media')
    .select('*')
    .eq('location_id', location.id)
    .order('create_time', { ascending: false })

  const mediaItems = (media || []) as GBPMedia[]

  // Fetch posts
  const { data: postsData } = await adminClient
    .from('gbp_posts')
    .select('*')
    .eq('location_id', location.id)
    .order('create_time', { ascending: false })

  const postItems = (postsData || []) as GBPPost[]

  const { data: queuedData } = await adminClient
    .from('gbp_post_queue')
    .select('*')
    .eq('location_id', location.id)
    .in('status', ['pending', 'sending'])
    .order('created_at', { ascending: false })

  const queuedPosts = (queuedData || []) as GBPPostQueue[]

  // Fetch review stats
  const { data: reviewSource } = await adminClient
    .from('review_sources')
    .select('total_review_count, average_rating, last_synced_at')
    .eq('location_id', location.id)
    .eq('platform', 'google')
    .single()

  return (
    <div>
      {/* Breadcrumb */}
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
          <h1 className="text-2xl font-serif text-ink">Google Business Profile</h1>
          <p className="text-xs text-warm-gray mt-1">
            {gbp ? (gbp.business_name || location.name) : location.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {gbp?.maps_uri && (
            <a
              href={gbp.maps_uri}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 border border-warm-border text-warm-gray text-xs rounded-full hover:text-ink hover:border-ink no-underline transition-colors"
            >
              View on Google Maps
            </a>
          )}
        </div>
      </div>

      {!gbp ? (
        <div className="border border-warm-border rounded-xl p-12 text-center">
          <p className="text-sm text-warm-gray mb-2">No GBP profile data synced yet.</p>
          <p className="text-xs text-warm-gray">
            Profile data will sync automatically after importing this location via the{' '}
            <a href="/agency/integrations" className="text-ink underline hover:no-underline">
              integrations page
            </a>.
          </p>
        </div>
      ) : (
        <GBPProfileContent
          profile={gbp}
          mediaItems={mediaItems}
          postItems={postItems}
          queuedPosts={queuedPosts}
          reviewSource={reviewSource}
          isAdmin={isAdmin}
          locationId={location.id}
          locationName={location.name}
          basePath={basePath}
          orgSlug={params.orgSlug}
        />
      )}
    </div>
  )
}
