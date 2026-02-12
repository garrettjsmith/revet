import type { GBPProfile } from '@/lib/types'

export interface AuditSection {
  key: string
  label: string
  score: number
  maxScore: number
  status: 'good' | 'warning' | 'poor'
  suggestion: string | null
}

export interface AuditResult {
  score: number
  sections: AuditSection[]
}

/**
 * Deterministic profile audit — no AI calls.
 * Scores a GBP profile on completeness and activity.
 */
export function auditGBPProfile({
  profile,
  mediaCount,
  reviewCount,
  avgRating,
  responseRate,
  postCount,
}: {
  profile: GBPProfile
  mediaCount: number
  reviewCount: number
  avgRating: number | null
  responseRate: number // 0-1
  postCount: number
}): AuditResult {
  const sections: AuditSection[] = []

  // 1. Description (15 points)
  const desc = profile.description || ''
  let descScore = 0
  let descSuggestion: string | null = null
  if (desc.length >= 500) {
    descScore = 15
  } else if (desc.length >= 200) {
    descScore = 10
    descSuggestion = `Expand your description to 500+ characters (currently ${desc.length}). More detail helps Google understand your business.`
  } else if (desc.length > 0) {
    descScore = 5
    descSuggestion = `Your description is only ${desc.length} characters. Aim for 500-750 characters covering your services, location, and unique value.`
  } else {
    descSuggestion = 'Add a business description. This is one of the most important fields for local search visibility.'
  }
  sections.push({
    key: 'description',
    label: 'Description',
    score: descScore,
    maxScore: 15,
    status: descScore >= 12 ? 'good' : descScore >= 5 ? 'warning' : 'poor',
    suggestion: descSuggestion,
  })

  // 2. Categories (15 points)
  const additionalCount = (profile.additional_categories || []).length
  let catScore = 0
  let catSuggestion: string | null = null
  if (profile.primary_category_id) {
    catScore += 8
    if (additionalCount >= 3) {
      catScore += 7
    } else if (additionalCount >= 1) {
      catScore += 4
      catSuggestion = `Add ${3 - additionalCount} more additional categories. You have ${additionalCount}, aim for 3-5 relevant categories.`
    } else {
      catSuggestion = 'Add additional categories to help Google match your business to more search queries.'
    }
  } else {
    catSuggestion = 'Set a primary business category. This is critical for local search ranking.'
  }
  sections.push({
    key: 'categories',
    label: 'Categories',
    score: catScore,
    maxScore: 15,
    status: catScore >= 12 ? 'good' : catScore >= 5 ? 'warning' : 'poor',
    suggestion: catSuggestion,
  })

  // 3. Hours (10 points)
  const hasPeriods = (profile.regular_hours?.periods || []).length > 0
  let hoursScore = hasPeriods ? 10 : 0
  let hoursSuggestion: string | null = null
  if (!hasPeriods) {
    hoursSuggestion = 'Set your regular business hours. Profiles without hours rank lower in local search.'
  }
  sections.push({
    key: 'hours',
    label: 'Hours',
    score: hoursScore,
    maxScore: 10,
    status: hoursScore >= 8 ? 'good' : hoursScore >= 5 ? 'warning' : 'poor',
    suggestion: hoursSuggestion,
  })

  // 4. Attributes (15 points)
  const attrCount = (profile.attributes || []).length
  let attrScore = 0
  let attrSuggestion: string | null = null
  if (attrCount >= 10) {
    attrScore = 15
  } else if (attrCount >= 5) {
    attrScore = 10
    attrSuggestion = `Add more business attributes. You have ${attrCount}, aim for 10+ to maximize visibility.`
  } else if (attrCount > 0) {
    attrScore = 5
    attrSuggestion = `Only ${attrCount} attributes set. Fill in all applicable attributes (accessibility, amenities, payments, etc.).`
  } else {
    attrSuggestion = 'Add business attributes. These help Google match your profile to filtered searches.'
  }
  sections.push({
    key: 'attributes',
    label: 'Attributes',
    score: attrScore,
    maxScore: 15,
    status: attrScore >= 12 ? 'good' : attrScore >= 5 ? 'warning' : 'poor',
    suggestion: attrSuggestion,
  })

  // 5. Photos (15 points)
  let photoScore = 0
  let photoSuggestion: string | null = null
  if (mediaCount >= 10) {
    photoScore = 15
  } else if (mediaCount >= 5) {
    photoScore = 10
    photoSuggestion = `Add ${10 - mediaCount} more photos. Businesses with 10+ photos get more engagement.`
  } else if (mediaCount > 0) {
    photoScore = 5
    photoSuggestion = `Only ${mediaCount} photos. Upload at least 10 quality photos (interior, exterior, team, services).`
  } else {
    photoSuggestion = 'Add photos to your profile. Listings with photos receive 42% more direction requests.'
  }
  sections.push({
    key: 'photos',
    label: 'Photos',
    score: photoScore,
    maxScore: 15,
    status: photoScore >= 12 ? 'good' : photoScore >= 5 ? 'warning' : 'poor',
    suggestion: photoSuggestion,
  })

  // 6. Reviews (15 points)
  let reviewScore = 0
  let reviewSuggestion: string | null = null
  if (responseRate >= 0.8 && reviewCount >= 10) {
    reviewScore = 15
  } else if (responseRate >= 0.5) {
    reviewScore = 10
    if (responseRate < 0.8) {
      reviewSuggestion = `Response rate is ${Math.round(responseRate * 100)}%. Aim for 80%+ to signal active management.`
    }
  } else if (reviewCount > 0) {
    reviewScore = 5
    reviewSuggestion = `Response rate is ${Math.round(responseRate * 100)}%. Responding to reviews improves ranking and customer trust.`
  } else {
    reviewSuggestion = 'No reviews yet. Reviews are a key ranking factor for local search.'
  }
  sections.push({
    key: 'reviews',
    label: 'Reviews',
    score: reviewScore,
    maxScore: 15,
    status: reviewScore >= 12 ? 'good' : reviewScore >= 5 ? 'warning' : 'poor',
    suggestion: reviewSuggestion,
  })

  // 7. Activity (15 points)
  let activityScore = 0
  let activitySuggestion: string | null = null
  if (postCount >= 4) {
    activityScore = 15
  } else if (postCount >= 1) {
    activityScore = 8
    activitySuggestion = `Only ${postCount} recent post${postCount === 1 ? '' : 's'}. Post weekly to signal an active business.`
  } else {
    activitySuggestion = 'No recent Google Posts. Regular posting signals an active, engaged business.'
  }
  sections.push({
    key: 'activity',
    label: 'Activity',
    score: activityScore,
    maxScore: 15,
    status: activityScore >= 12 ? 'good' : activityScore >= 5 ? 'warning' : 'poor',
    suggestion: activitySuggestion,
  })

  const totalScore = sections.reduce((sum, s) => sum + s.score, 0)

  return { score: totalScore, sections }
}
