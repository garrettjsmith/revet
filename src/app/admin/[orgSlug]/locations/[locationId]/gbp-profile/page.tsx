import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgBySlug } from '@/lib/org'
import { getLocation } from '@/lib/locations'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { GBPProfile, GBPMedia } from '@/lib/types'

export const dynamic = 'force-dynamic'

const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
const DAY_SHORT: Record<string, string> = {
  MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed', THURSDAY: 'Thu',
  FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun',
}

function formatTime(t: unknown): string {
  if (!t) return ''
  // Handle object format from Google API: {hours: 9, minutes: 0}
  if (typeof t === 'object' && t !== null) {
    const obj = t as Record<string, number>
    const h = obj.hours ?? 0
    const m = obj.minutes ?? 0
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
  }
  // Handle string format: "09:00"
  if (typeof t === 'string') {
    const [h, m] = t.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
  }
  return ''
}

export default async function GBPProfilePage({
  params,
}: {
  params: { orgSlug: string; locationId: string }
}) {
  const org = await getOrgBySlug(params.orgSlug)
  const location = await getLocation(params.locationId, org.id)
  if (!location) notFound()

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
        <div className="space-y-6">
          {/* Status bar */}
          <div className="flex items-center gap-4 text-xs">
            <span className={`inline-flex items-center gap-1.5 font-medium ${
              gbp.verification_state === 'VERIFIED' ? 'text-emerald-600' :
              gbp.verification_state === 'UNVERIFIED' ? 'text-amber-600' : 'text-warm-gray'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                gbp.verification_state === 'VERIFIED' ? 'bg-emerald-500' :
                gbp.verification_state === 'UNVERIFIED' ? 'bg-amber-500' : 'bg-warm-border'
              }`} />
              {gbp.verification_state || 'Unknown'}
            </span>
            <span className={`inline-flex items-center gap-1.5 font-medium ${
              gbp.open_status === 'OPEN' ? 'text-emerald-600' :
              gbp.open_status === 'CLOSED_TEMPORARILY' ? 'text-amber-600' : 'text-red-600'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                gbp.open_status === 'OPEN' ? 'bg-emerald-500' :
                gbp.open_status === 'CLOSED_TEMPORARILY' ? 'bg-amber-500' : 'bg-red-500'
              }`} />
              {gbp.open_status === 'OPEN' ? 'Open' :
               gbp.open_status === 'CLOSED_TEMPORARILY' ? 'Temporarily Closed' :
               gbp.open_status === 'CLOSED_PERMANENTLY' ? 'Permanently Closed' : 'Unknown'}
            </span>
            {gbp.has_pending_edits && (
              <span className="text-amber-600 font-medium">Pending edits</span>
            )}
            {gbp.has_google_updated && (
              <span className="text-blue-600 font-medium">Google update available</span>
            )}
            {gbp.last_synced_at && (
              <span className="text-warm-gray ml-auto">
                Last synced {new Date(gbp.last_synced_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-ink rounded-xl p-5">
              <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Reviews</div>
              <div className="text-2xl font-bold font-mono text-cream">{reviewSource?.total_review_count || 0}</div>
            </div>
            <div className="bg-ink rounded-xl p-5">
              <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Avg Rating</div>
              <div className="text-2xl font-bold font-mono text-cream">{reviewSource?.average_rating ? Number(reviewSource.average_rating).toFixed(1) : '—'}</div>
            </div>
            <div className="bg-ink rounded-xl p-5">
              <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Category</div>
              <div className="text-sm font-medium text-cream mt-1 truncate">{gbp.primary_category_name || '—'}</div>
            </div>
            <div className="bg-ink rounded-xl p-5">
              <div className="text-[11px] text-warm-gray uppercase tracking-wider mb-1">Photos</div>
              <div className="text-2xl font-bold font-mono text-cream">{mediaItems.length}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Left column — Profile details */}
            <div className="space-y-6">
              {/* Business Info */}
              <div className="border border-warm-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-warm-border">
                  <h2 className="text-sm font-semibold text-ink">Business Information</h2>
                </div>
                <div className="p-5 space-y-4">
                  <Field label="Business Name" value={gbp.business_name} />
                  <Field label="Phone" value={gbp.phone_primary} />
                  <Field label="Website" value={gbp.website_uri} link />
                  <Field label="Primary Category" value={gbp.primary_category_name} />
                  {(gbp.additional_categories || []).length > 0 && (
                    <div>
                      <div className="text-[10px] text-warm-gray uppercase tracking-wider mb-1">Additional Categories</div>
                      <div className="flex flex-wrap gap-1.5">
                        {gbp.additional_categories.map((c) => (
                          <span key={c.name} className="text-xs text-ink px-2 py-0.5 bg-warm-light rounded-full">
                            {c.displayName}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {gbp.description && (
                    <div>
                      <div className="text-[10px] text-warm-gray uppercase tracking-wider mb-1">Description</div>
                      <p className="text-xs text-ink leading-relaxed">{gbp.description}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Address */}
              <div className="border border-warm-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-warm-border">
                  <h2 className="text-sm font-semibold text-ink">Address</h2>
                </div>
                <div className="p-5 space-y-4">
                  {gbp.address && (
                    <>
                      <Field label="Street" value={(gbp.address as any).addressLines?.join(', ')} />
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="City" value={(gbp.address as any).locality} />
                        <Field label="State" value={(gbp.address as any).administrativeArea} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="Postal Code" value={(gbp.address as any).postalCode} />
                        <Field label="Country" value={(gbp.address as any).regionCode} />
                      </div>
                    </>
                  )}
                  {gbp.latitude && gbp.longitude && (
                    <Field label="Coordinates" value={`${gbp.latitude.toFixed(6)}, ${gbp.longitude.toFixed(6)}`} />
                  )}
                </div>
              </div>

              {/* Labels */}
              {(gbp.labels || []).length > 0 && (
                <div className="border border-warm-border rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-warm-border">
                    <h2 className="text-sm font-semibold text-ink">Labels</h2>
                  </div>
                  <div className="p-5">
                    <div className="flex flex-wrap gap-1.5">
                      {gbp.labels.map((l) => (
                        <span key={l} className="text-xs text-ink px-2.5 py-1 bg-warm-light rounded-full border border-warm-border">
                          {l}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right column — Hours + Links */}
            <div className="space-y-6">
              {/* Hours */}
              <div className="border border-warm-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-warm-border">
                  <h2 className="text-sm font-semibold text-ink">Hours</h2>
                </div>
                <div className="p-5">
                  {gbp.regular_hours?.periods && gbp.regular_hours.periods.length > 0 ? (
                    <div className="space-y-2">
                      {DAY_ORDER.map((day) => {
                        const periods = gbp.regular_hours.periods!.filter((p) => p.openDay === day)
                        return (
                          <div key={day} className="flex items-center justify-between text-xs">
                            <span className="text-warm-gray font-medium w-10">{DAY_SHORT[day]}</span>
                            {periods.length === 0 ? (
                              <span className="text-warm-gray">Closed</span>
                            ) : (
                              <div className="text-ink">
                                {periods.map((p, i) => (
                                  <span key={i}>
                                    {i > 0 && ', '}
                                    {formatTime(p.openTime)} – {formatTime(p.closeTime)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-warm-gray">No hours set</p>
                  )}
                </div>
              </div>

              {/* Quick Links */}
              <div className="border border-warm-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-warm-border">
                  <h2 className="text-sm font-semibold text-ink">Quick Links</h2>
                </div>
                <div className="p-5 space-y-3">
                  {gbp.maps_uri && (
                    <a href={gbp.maps_uri} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between text-xs text-ink hover:text-ink/70 no-underline transition-colors">
                      <span>Google Maps Listing</span>
                      <span className="text-warm-gray">→</span>
                    </a>
                  )}
                  {gbp.new_review_uri && (
                    <a href={gbp.new_review_uri} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between text-xs text-ink hover:text-ink/70 no-underline transition-colors">
                      <span>Leave a Review Link</span>
                      <span className="text-warm-gray">→</span>
                    </a>
                  )}
                  {gbp.website_uri && (
                    <a href={gbp.website_uri} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between text-xs text-ink hover:text-ink/70 no-underline transition-colors">
                      <span>Website</span>
                      <span className="text-warm-gray">→</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Attributes */}
              {(gbp.attributes || []).length > 0 && (
                <div className="border border-warm-border rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-warm-border">
                    <h2 className="text-sm font-semibold text-ink">Attributes</h2>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-2 gap-2">
                      {(gbp.attributes as Array<any>).slice(0, 20).map((attr, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          {attr.values?.[0] === true ? (
                            <span className="text-emerald-500">✓</span>
                          ) : attr.values?.[0] === false ? (
                            <span className="text-warm-gray">✗</span>
                          ) : (
                            <span className="text-warm-gray">·</span>
                          )}
                          <span className="text-ink truncate">
                            {attr.attributeId?.replace(/_/g, ' ').replace(/^./, (s: string) => s.toUpperCase()) || `Attribute ${i + 1}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Photos */}
          {mediaItems.length > 0 && (
            <div className="border border-warm-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-warm-border">
                <h2 className="text-sm font-semibold text-ink">Photos ({mediaItems.length})</h2>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-6 gap-3">
                  {mediaItems.map((m) => (
                    <div key={m.id} className="aspect-square rounded-lg overflow-hidden bg-warm-light border border-warm-border">
                      {m.google_url ? (
                        <img
                          src={`${m.google_url}=s300`}
                          alt={m.description || ''}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-warm-gray">
                          No preview
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, value, link }: { label: string; value: string | null | undefined; link?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-warm-gray uppercase tracking-wider mb-0.5">{label}</div>
      {value ? (
        link ? (
          <a href={value} target="_blank" rel="noopener noreferrer" className="text-xs text-ink hover:text-ink/70 no-underline transition-colors break-all">
            {value}
          </a>
        ) : (
          <div className="text-xs text-ink">{value}</div>
        )
      ) : (
        <div className="text-xs text-warm-gray">—</div>
      )}
    </div>
  )
}
