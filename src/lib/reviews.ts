import { createServerSupabase } from '@/lib/supabase/server'
import type { Review, ReviewSource, ReviewSourceStats } from '@/lib/types'

/**
 * Get all review sources for a location.
 */
export async function getLocationReviewSources(locationId: string): Promise<ReviewSource[]> {
  const supabase = createServerSupabase()
  const { data } = await supabase
    .from('review_sources')
    .select('*')
    .eq('location_id', locationId)
    .order('platform')

  return (data || []) as ReviewSource[]
}

/**
 * Get review source stats for a location (uses the view).
 */
export async function getLocationReviewStats(locationId: string): Promise<ReviewSourceStats[]> {
  const supabase = createServerSupabase()
  const { data } = await supabase
    .from('review_source_stats')
    .select('*')
    .eq('location_id', locationId)

  return (data || []) as ReviewSourceStats[]
}

/**
 * Get reviews for a location with filters.
 */
export async function getLocationReviews(
  locationId: string,
  opts?: {
    platform?: string
    status?: string
    minRating?: number
    maxRating?: number
    limit?: number
    offset?: number
  }
): Promise<{ reviews: Review[]; count: number }> {
  const supabase = createServerSupabase()
  const limit = opts?.limit || 25
  const offset = opts?.offset || 0

  let query = supabase
    .from('reviews')
    .select('*', { count: 'exact' })
    .eq('location_id', locationId)
    .order('published_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (opts?.platform) query = query.eq('platform', opts.platform)
  if (opts?.status) query = query.eq('status', opts.status)
  if (opts?.minRating) query = query.gte('rating', opts.minRating)
  if (opts?.maxRating) query = query.lte('rating', opts.maxRating)

  const { data, count } = await query

  return {
    reviews: (data || []) as Review[],
    count: count || 0,
  }
}

/**
 * Get reviews across all locations for an org.
 */
export async function getOrgReviews(
  orgId: string,
  opts?: {
    platform?: string
    status?: string
    limit?: number
  }
): Promise<{ reviews: Review[]; count: number }> {
  const supabase = createServerSupabase()
  const limit = opts?.limit || 50

  // Get location IDs for this org
  const { data: locations } = await supabase
    .from('locations')
    .select('id')
    .eq('org_id', orgId)

  const locationIds = (locations || []).map((l: { id: string }) => l.id)
  if (locationIds.length === 0) return { reviews: [], count: 0 }

  let query = supabase
    .from('reviews')
    .select('*, locations(name)', { count: 'exact' })
    .in('location_id', locationIds)
    .order('published_at', { ascending: false })
    .limit(limit)

  if (opts?.platform) query = query.eq('platform', opts.platform)
  if (opts?.status) query = query.eq('status', opts.status)

  const { data, count } = await query

  return {
    reviews: (data || []).map((r: any) => ({
      ...r,
      location_name: r.locations?.name || null,
    })) as Review[],
    count: count || 0,
  }
}

/**
 * Auto-classify review sentiment based on rating.
 */
export function classifySentiment(rating: number | null): 'positive' | 'neutral' | 'negative' | null {
  if (rating === null) return null
  if (rating >= 4) return 'positive'
  if (rating === 3) return 'neutral'
  return 'negative'
}

/**
 * Platform display labels and colors.
 */
export const PLATFORM_CONFIG: Record<string, { label: string; color: string }> = {
  google: { label: 'Google', color: '#4285F4' },
  healthgrades: { label: 'Healthgrades', color: '#00A87E' },
  yelp: { label: 'Yelp', color: '#FF1A1A' },
  facebook: { label: 'Facebook', color: '#1877F2' },
  vitals: { label: 'Vitals', color: '#00B4D8' },
  zocdoc: { label: 'Zocdoc', color: '#FF7F50' },
}
