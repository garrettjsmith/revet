import { createAdminClient } from '@/lib/supabase/admin'
import { LocalLanderPage } from '@/components/local-lander'
import { generateJsonLd } from '@/lib/schema'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import type { LocalLander, Location, GBPProfile, Review } from '@/lib/types'

// ISR: regenerate every 5 minutes so edits propagate quickly
export const revalidate = 300

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

  // Fetch location + GBP profile + reviews in parallel
  const [locationResult, gbpResult, reviewSourcesResult] = await Promise.all([
    supabase.from('locations').select('*').eq('id', lander.location_id).single(),
    supabase.from('gbp_profiles').select('*').eq('location_id', lander.location_id).single(),
    supabase.from('review_sources')
      .select('total_review_count, average_rating')
      .eq('location_id', lander.location_id)
      .eq('platform', 'google')
      .single(),
  ])

  const location = locationResult.data as Location | null
  if (!location) return null

  const gbp = gbpResult.data as GBPProfile | null

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

  return {
    lander: lander as LocalLander,
    location,
    gbp,
    reviews: (reviews || []) as Review[],
    reviewStats,
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getLanderData(params.slug)
  if (!data) return { title: 'Not Found' }

  const { lander, location, gbp } = data
  const name = lander.heading || gbp?.business_name || location.name
  const desc = lander.custom_about || lander.description || gbp?.description

  return {
    title: name,
    description: desc || `${name} — location information, hours, and reviews.`,
    robots: { index: true, follow: true },
  }
}

export default async function LanderPage({ params }: Props) {
  const data = await getLanderData(params.slug)
  if (!data) notFound()

  const { lander, location, gbp, reviews, reviewStats } = data

  // Generate JSON-LD schema
  const jsonLd = generateJsonLd({ location, gbp, lander, reviewStats })

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LocalLanderPage
        lander={lander}
        location={location}
        gbp={gbp}
        reviews={reviews}
        reviewStats={reviewStats}
      />
    </>
  )
}
