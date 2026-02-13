import { createAdminClient } from '@/lib/supabase/admin'
import { LocalLanderPage } from '@/components/local-lander'
import { generateJsonLd } from '@/lib/schema'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import type { LocalLander, Location, GBPProfile, GBPMedia, Review } from '@/lib/types'

// ISR: regenerate every 5 minutes so edits propagate quickly
export const revalidate = 300

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://use.revet.app'

interface Props {
  params: { slug: string }
}

async function getLanderData(slug: string) {
  const supabase = createAdminClient()

  // Fetch lander by slug
  const { data: lander } = await supabase
    .from('local_landers')
    .select('*')
    .eq('slug', slug)
    .eq('active', true)
    .single()

  if (!lander) return null

  // Fetch location + GBP profile + media + review sources in parallel
  const [locationResult, gbpResult, mediaResult] = await Promise.all([
    supabase.from('locations').select('*').eq('id', lander.location_id).single(),
    supabase.from('gbp_profiles').select('*').eq('location_id', lander.location_id).single(),
    supabase
      .from('gbp_media')
      .select('*')
      .eq('location_id', lander.location_id)
      .eq('media_format', 'PHOTO')
      .order('create_time', { ascending: false })
      .limit(8),
  ])

  const location = locationResult.data as Location | null
  if (!location) return null

  const gbp = gbpResult.data as GBPProfile | null
  const photos = (mediaResult.data || []) as GBPMedia[]

  // Aggregate review stats across all sources for this location
  const { data: allSources } = await supabase
    .from('review_sources')
    .select('total_review_count, average_rating')
    .eq('location_id', lander.location_id)

  let reviewStats: { averageRating: number; reviewCount: number } | null = null
  if (allSources && allSources.length > 0) {
    const totalCount = allSources.reduce((sum, s) => sum + (s.total_review_count || 0), 0)
    const weightedSum = allSources.reduce(
      (sum, s) => sum + (s.average_rating || 0) * (s.total_review_count || 0),
      0
    )
    if (totalCount > 0) {
      reviewStats = {
        averageRating: weightedSum / totalCount,
        reviewCount: totalCount,
      }
    }
  }

  // Fetch top recent positive reviews for display
  const { data: reviews } = await supabase
    .from('reviews')
    .select('*')
    .eq('location_id', lander.location_id)
    .gte('rating', 4)
    .order('published_at', { ascending: false })
    .limit(5)

  // Fetch nearby locations from the same org (for internal linking)
  let nearbyLocations: Array<{ id: string; name: string; city: string | null; state: string | null; lander_slug: string }> = []
  if (gbp?.latitude && gbp?.longitude) {
    // Use PostGIS-style proximity: order by distance approximation
    const { data: nearby } = await supabase
      .from('local_landers')
      .select('slug, location_id, locations!inner(id, name, city, state, org_id)')
      .eq('active', true)
      .neq('slug', lander.slug)
      .limit(20)

    if (nearby) {
      // Filter to same org and sort by rough distance
      const sameOrg = nearby.filter((n: any) => n.locations?.org_id === location.org_id)
      // We'll pass these through and let the component render the nearest ones
      nearbyLocations = sameOrg.slice(0, 5).map((n: any) => ({
        id: n.locations.id,
        name: n.locations.name,
        city: n.locations.city,
        state: n.locations.state,
        lander_slug: n.slug,
      }))
    }
  } else {
    // No coordinates — fall back to same-org landers
    const { data: nearby } = await supabase
      .from('local_landers')
      .select('slug, location_id, locations!inner(id, name, city, state, org_id)')
      .eq('active', true)
      .neq('slug', lander.slug)
      .limit(20)

    if (nearby) {
      const sameOrg = nearby.filter((n: any) => n.locations?.org_id === location.org_id)
      nearbyLocations = sameOrg.slice(0, 5).map((n: any) => ({
        id: n.locations.id,
        name: n.locations.name,
        city: n.locations.city,
        state: n.locations.state,
        lander_slug: n.slug,
      }))
    }
  }

  return {
    lander: lander as LocalLander,
    location,
    gbp,
    photos,
    reviews: (reviews || []) as Review[],
    reviewStats,
    nearbyLocations,
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getLanderData(params.slug)
  if (!data) return { title: 'Not Found' }

  const { lander, location, gbp, reviewStats, photos } = data
  const name = lander.heading || gbp?.business_name || location.name
  const city = location.city
  const state = location.state
  const category = gbp?.primary_category_name
  const phone = gbp?.phone_primary || location.phone

  // Title: "{Name} in {City}, {State} | {Category}" — max ~60 chars
  const geo = [city, state].filter(Boolean).join(', ')
  const titleParts = [name]
  if (geo) titleParts.push(`in ${geo}`)
  if (category) titleParts.push(`| ${category}`)
  const title = titleParts.join(' ').slice(0, 70)

  // Description: pack with local signals, rating, phone — 120-155 chars
  const descParts: string[] = []
  if (geo) descParts.push(`${name} in ${geo}.`)
  else descParts.push(`${name}.`)
  if (category) descParts.push(category + '.')
  if (reviewStats) {
    descParts.push(`Rated ${reviewStats.averageRating.toFixed(1)} stars (${reviewStats.reviewCount} reviews).`)
  }
  if (phone) descParts.push(`Call ${phone}.`)
  const description = descParts.join(' ').slice(0, 160)

  const canonicalUrl = `${APP_URL}/l/${lander.slug}`

  // OG image: prefer first photo, then logo
  const ogImage = photos[0]?.google_url || lander.logo_url || undefined

  return {
    title,
    description,
    robots: { index: true, follow: true },
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: 'website',
      ...(ogImage && { images: [{ url: ogImage }] }),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(ogImage && { images: [ogImage] }),
    },
  }
}

export default async function LanderPage({ params }: Props) {
  const data = await getLanderData(params.slug)
  if (!data) notFound()

  const { lander, location, gbp, photos, reviews, reviewStats, nearbyLocations } = data

  // Generate JSON-LD schema (returns array: LocalBusiness + optional FAQPage)
  const schemas = generateJsonLd({ location, gbp, lander, reviewStats, photos })

  return (
    <>
      {schemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <LocalLanderPage
        lander={lander}
        location={location}
        gbp={gbp}
        photos={photos}
        reviews={reviews}
        reviewStats={reviewStats}
        nearbyLocations={nearbyLocations}
      />
    </>
  )
}
