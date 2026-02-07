import { googleFetch } from './auth'

const GBP_V4_API = 'https://mybusiness.googleapis.com/v4'

/** Star rating enum from Google → numeric */
const STAR_RATING_MAP: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
}

export interface GoogleReviewRaw {
  name: string           // "accounts/123/locations/456/reviews/789"
  reviewId: string
  reviewer: {
    profilePhotoUrl?: string
    displayName?: string
    isAnonymous?: boolean
  }
  starRating: string     // "ONE" | "TWO" | ... | "FIVE"
  comment?: string
  createTime: string
  updateTime: string
  reviewReply?: {
    comment: string
    updateTime: string
  }
}

export interface GoogleReviewsResponse {
  reviews?: GoogleReviewRaw[]
  averageRating?: number
  totalReviewCount?: number
  nextPageToken?: string
}

/**
 * Fetch reviews for a GBP location.
 * Uses the legacy v4 API (reviews haven't migrated to v1).
 *
 * @param locationResourceName - Full resource name like "accounts/123/locations/456"
 */
export async function fetchGoogleReviews(
  locationResourceName: string,
  opts?: { pageSize?: number; pageToken?: string; orderBy?: string }
): Promise<GoogleReviewsResponse> {
  const params = new URLSearchParams({
    pageSize: String(opts?.pageSize || 50),
    orderBy: opts?.orderBy || 'updateTime desc',
  })
  if (opts?.pageToken) params.set('pageToken', opts.pageToken)

  const response = await googleFetch(
    `${GBP_V4_API}/${locationResourceName}/reviews?${params.toString()}`
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Failed to fetch reviews: ${response.status} ${JSON.stringify(err)}`)
  }

  return response.json()
}

/**
 * Fetch ALL reviews for a location (paginates automatically).
 */
export async function fetchAllGoogleReviews(
  locationResourceName: string
): Promise<GoogleReviewRaw[]> {
  const all: GoogleReviewRaw[] = []
  let pageToken: string | undefined

  do {
    const data = await fetchGoogleReviews(locationResourceName, { pageToken })
    if (data.reviews) all.push(...data.reviews)
    pageToken = data.nextPageToken
  } while (pageToken)

  return all
}

/**
 * Post a reply to a Google review.
 */
export async function replyToGoogleReview(
  reviewResourceName: string,
  comment: string
): Promise<void> {
  const response = await googleFetch(`${GBP_V4_API}/${reviewResourceName}/reply`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Failed to reply to review: ${response.status} ${JSON.stringify(err)}`)
  }
}

/**
 * Delete a reply from a Google review.
 */
export async function deleteGoogleReviewReply(reviewResourceName: string): Promise<void> {
  const response = await googleFetch(`${GBP_V4_API}/${reviewResourceName}/reply`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Failed to delete reply: ${response.status} ${JSON.stringify(err)}`)
  }
}

/**
 * Normalize a raw Google review into our internal review format for the sync API.
 */
export function normalizeGoogleReview(raw: GoogleReviewRaw): {
  platform_review_id: string
  reviewer_name: string | null
  reviewer_photo_url: string | null
  is_anonymous: boolean
  rating: number | null
  original_rating: string
  body: string | null
  published_at: string
  updated_at: string | null
  reply_body: string | null
  reply_published_at: string | null
  platform_metadata: Record<string, unknown>
} {
  return {
    platform_review_id: raw.reviewId,
    reviewer_name: raw.reviewer?.displayName || null,
    reviewer_photo_url: raw.reviewer?.profilePhotoUrl || null,
    is_anonymous: raw.reviewer?.isAnonymous || false,
    rating: STAR_RATING_MAP[raw.starRating] ?? null,
    original_rating: raw.starRating,
    body: raw.comment || null,
    published_at: raw.createTime,
    updated_at: raw.updateTime !== raw.createTime ? raw.updateTime : null,
    reply_body: raw.reviewReply?.comment || null,
    reply_published_at: raw.reviewReply?.updateTime || null,
    platform_metadata: {
      resource_name: raw.name,
    },
  }
}
