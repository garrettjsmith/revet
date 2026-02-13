import type { ServiceTier } from '@/lib/types'

/**
 * Feature gating by service tier.
 *
 * Starter  — review sync, dashboards, manual replies, digest emails
 * Standard — + AI reply drafts, profile optimization, brand config
 * Premium  — + automated posts, review autopilot (auto-send), local landers
 */

export type TierFeature =
  | 'ai_reply_drafts'
  | 'review_autopilot'
  | 'profile_optimization'
  | 'post_generation'
  | 'local_landers'

const TIER_FEATURES: Record<ServiceTier, Set<TierFeature>> = {
  starter: new Set(),
  standard: new Set<TierFeature>([
    'ai_reply_drafts',
    'profile_optimization',
  ]),
  premium: new Set<TierFeature>([
    'ai_reply_drafts',
    'review_autopilot',
    'profile_optimization',
    'post_generation',
    'local_landers',
  ]),
}

/**
 * Check if a service tier includes a specific feature.
 */
export function tierIncludes(tier: ServiceTier, feature: TierFeature): boolean {
  return TIER_FEATURES[tier]?.has(feature) ?? false
}

/**
 * Minimum tier required for a feature.
 */
const FEATURE_MIN_TIER: Record<TierFeature, ServiceTier> = {
  ai_reply_drafts: 'standard',
  profile_optimization: 'standard',
  review_autopilot: 'premium',
  post_generation: 'premium',
  local_landers: 'premium',
}

/**
 * Get the minimum tier required for a feature.
 */
export function minTierFor(feature: TierFeature): ServiceTier {
  return FEATURE_MIN_TIER[feature]
}

/**
 * Tiers that include a feature — useful for database queries.
 * e.g. tiersWithFeature('ai_reply_drafts') → ['standard', 'premium']
 */
export function tiersWithFeature(feature: TierFeature): ServiceTier[] {
  return (['starter', 'standard', 'premium'] as ServiceTier[]).filter(
    (tier) => TIER_FEATURES[tier].has(feature)
  )
}
