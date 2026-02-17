export type OrgStatus = 'active' | 'inactive'

export interface Organization {
  id: string
  name: string
  slug: string
  logo_url: string | null
  website: string | null
  status: OrgStatus
  created_at: string
  updated_at: string
}

export type OrgRole = 'owner' | 'admin' | 'member'

export interface OrgMember {
  id: string
  org_id: string
  user_id: string
  role: OrgRole
  is_agency_admin: boolean
  location_access: 'all' | 'specific'
  created_at: string
  // joined
  org?: Organization
  email?: string
}

export interface OrgAccountManager {
  id: string
  org_id: string
  user_id: string
  created_at: string
  // joined
  email?: string
  org_name?: string
}

export type LocationType = 'place' | 'practitioner' | 'service_area'

export interface Location {
  id: string
  org_id: string
  type: LocationType
  name: string
  slug: string
  place_id: string | null
  phone: string | null
  email: string | null
  timezone: string
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string
  metadata: Record<string, unknown>
  service_tier: 'starter' | 'standard' | 'premium'
  setup_status: 'pending' | 'audited' | 'optimizing' | 'optimized'
  active: boolean
  created_at: string
  updated_at: string
}

export type ServiceTier = 'starter' | 'standard' | 'premium'

export interface ReviewProfile {
  id: string
  org_id: string
  location_id: string | null
  name: string
  slug: string
  heading: string
  subtext: string
  place_id: string
  manager_email: string
  manager_name: string
  primary_color: string
  accent_color: string
  logo_url: string | null
  logo_text: string | null
  logo_subtext: string | null
  positive_threshold: number
  active: boolean
  created_at: string
  updated_at: string
  // joined
  org_name?: string
  location_name?: string
}

export interface ReviewEvent {
  id: string
  profile_id: string
  event_type: 'page_view' | 'rating_submitted' | 'google_click' | 'email_click'
  rating: number | null
  routed_to: 'google' | 'email' | null
  metadata: Record<string, unknown>
  session_id: string | null
  created_at: string
}

export interface ProfileStats {
  profile_id: string
  profile_name: string
  slug: string
  org_id: string
  location_id: string | null
  org_name: string
  location_name: string | null
  total_views: number
  total_ratings: number
  google_clicks: number
  email_clicks: number
  avg_rating: number | null
  views_7d: number
  google_clicks_7d: number
  email_clicks_7d: number
}

export interface AgencyIntegration {
  id: string
  provider: string
  account_email: string | null
  status: 'connected' | 'disconnected' | 'error'
  access_token_encrypted: string | null
  refresh_token_encrypted: string | null
  token_expires_at: string | null
  scopes: string[]
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface AgencyIntegrationMapping {
  id: string
  integration_id: string
  external_resource_id: string
  external_resource_name: string | null
  resource_type: string
  org_id: string | null
  location_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

// Reviews

export type ReviewPlatform = 'google' | 'healthgrades' | 'yelp' | 'facebook' | 'vitals' | 'zocdoc'
export type ReviewStatus = 'new' | 'seen' | 'flagged' | 'responded' | 'archived'
export type ReviewSentiment = 'positive' | 'neutral' | 'negative'
export type ReviewSyncStatus = 'pending' | 'active' | 'paused' | 'error'
export type ReviewAlertRuleType = 'new_review' | 'negative_review' | 'no_reply' | 'keyword_match'

export interface ReviewSource {
  id: string
  location_id: string
  platform: ReviewPlatform
  platform_listing_id: string
  platform_listing_name: string | null
  sync_status: ReviewSyncStatus
  last_synced_at: string | null
  sync_cursor: string | null
  total_review_count: number
  average_rating: number | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Review {
  id: string
  source_id: string
  location_id: string
  platform: ReviewPlatform
  platform_review_id: string
  reviewer_name: string | null
  reviewer_photo_url: string | null
  is_anonymous: boolean
  rating: number | null
  original_rating: string | null
  body: string | null
  language: string
  published_at: string
  updated_at: string | null
  reply_body: string | null
  reply_published_at: string | null
  replied_by: string | null
  replied_via: string | null
  status: ReviewStatus
  sentiment: ReviewSentiment | null
  internal_notes: string | null
  assigned_to: string | null
  ai_draft: string | null
  ai_draft_generated_at: string | null
  platform_metadata: Record<string, unknown>
  fetched_at: string
  created_at: string
  // joined
  location_name?: string
  source_name?: string
}

export interface ReviewAlertRule {
  id: string
  org_id: string
  location_id: string | null
  name: string
  rule_type: ReviewAlertRuleType
  config: Record<string, unknown>
  notify_emails: string[]
  notify_in_app: boolean
  active: boolean
  created_at: string
  updated_at: string
}

export interface ReviewSourceStats {
  source_id: string
  location_id: string
  platform: ReviewPlatform
  platform_listing_name: string | null
  sync_status: ReviewSyncStatus
  last_synced_at: string | null
  total_reviews: number
  avg_rating: number | null
  reviews_7d: number
  reviews_30d: number
  negative_count: number
  replied_count: number
  unread_count: number
}

// Forms

export type FormFieldType = 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'checkbox'

export interface FormField {
  id: string
  type: FormFieldType
  label: string
  placeholder?: string
  required?: boolean
  options?: string[] // for select fields
}

export interface FormTemplate {
  id: string
  org_id: string
  location_id: string | null
  name: string
  slug: string
  description: string | null
  fields: FormField[]
  alert_email: string | null
  alert_enabled: boolean
  heading: string
  subtext: string
  primary_color: string
  logo_url: string | null
  logo_text: string | null
  logo_subtext: string | null
  confirmation_heading: string
  confirmation_message: string
  active: boolean
  created_at: string
  updated_at: string
}

export interface FormSubmission {
  id: string
  form_id: string
  data: Record<string, string>
  metadata: Record<string, unknown>
  created_at: string
}

// Local Landers

export interface LocalLander {
  id: string
  org_id: string
  location_id: string
  slug: string
  template_id: string
  template_data: Record<string, unknown>
  heading: string | null
  description: string | null
  primary_color: string
  logo_url: string | null
  custom_about: string | null
  custom_services: Array<{ name: string; description: string }> | null
  custom_faq: Array<{ question: string; answer: string }> | null
  custom_hours: Record<string, unknown> | null
  ai_content: Record<string, unknown> | null
  ai_content_generated_at: string | null
  show_reviews: boolean
  show_map: boolean
  show_faq: boolean
  active: boolean
  created_at: string
  updated_at: string
}

// GBP Profiles

export type GBPSyncStatus = 'pending' | 'active' | 'error' | 'paused'
export type GBPOpenStatus = 'OPEN' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY'
export type GBPVerificationState = 'VERIFIED' | 'UNVERIFIED' | 'VERIFICATION_REQUESTED'

export interface GBPCategory {
  name: string
  displayName: string
}

export interface GBPHoursPeriod {
  openDay: string
  openTime: string
  closeDay: string
  closeTime: string
}

export interface GBPProfile {
  id: string
  location_id: string
  gbp_location_name: string
  gbp_account_name: string | null
  business_name: string | null
  description: string | null
  website_uri: string | null
  menu_uri: string | null
  phone_primary: string | null
  primary_category_id: string | null
  primary_category_name: string | null
  open_status: GBPOpenStatus | null
  verification_state: GBPVerificationState | null
  latitude: number | null
  longitude: number | null
  maps_uri: string | null
  new_review_uri: string | null
  has_pending_edits: boolean
  has_google_updated: boolean
  additional_categories: GBPCategory[]
  regular_hours: { periods?: GBPHoursPeriod[] }
  special_hours: Array<Record<string, unknown>>
  more_hours: Array<Record<string, unknown>>
  additional_phones: string[]
  address: Record<string, unknown>
  service_area: Record<string, unknown>
  attributes: Array<Record<string, unknown>>
  labels: string[]
  service_items: Array<Record<string, unknown>>
  sync_status: GBPSyncStatus
  last_synced_at: string | null
  last_pushed_at: string | null
  sync_error: string | null
  raw_google_data: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type GBPMediaFormat = 'PHOTO' | 'VIDEO'

export interface GBPMedia {
  id: string
  location_id: string
  gbp_media_name: string
  media_format: GBPMediaFormat
  category: string | null
  description: string | null
  google_url: string | null
  thumbnail_url: string | null
  width_px: number | null
  height_px: number | null
  source_account: string | null
  create_time: string | null
  created_at: string
}

export type GBPPostTopicType = 'STANDARD' | 'EVENT' | 'OFFER' | 'ALERT'
export type GBPPostState = 'LIVE' | 'REJECTED' | 'PROCESSING'

export interface GBPPost {
  id: string
  location_id: string
  gbp_post_name: string
  topic_type: GBPPostTopicType
  summary: string | null
  action_type: string | null
  action_url: string | null
  media_url: string | null
  event_title: string | null
  event_start: string | null
  event_end: string | null
  offer_coupon_code: string | null
  offer_terms: string | null
  state: GBPPostState
  search_url: string | null
  create_time: string | null
  update_time: string | null
  created_at: string
  updated_at: string
}

export type PostQueueStatus = 'draft' | 'client_review' | 'pending' | 'sending' | 'confirmed' | 'failed' | 'rejected'

export interface GBPPostQueue {
  id: string
  location_id: string
  topic_type: GBPPostTopicType
  summary: string
  action_type: string | null
  action_url: string | null
  media_url: string | null
  event_title: string | null
  event_start: string | null
  event_end: string | null
  offer_coupon_code: string | null
  offer_terms: string | null
  status: PostQueueStatus
  scheduled_for: string | null
  queued_by: string
  assigned_to: string | null
  topic_id: string | null
  source: 'manual' | 'ai'
  attempts: number
  last_error: string | null
  gbp_post_name: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}

// Post Topics

export type PostTopicSource = 'ai' | 'manual'

export interface GBPPostTopic {
  id: string
  location_id: string
  topic: string
  source: PostTopicSource
  used_at: string | null
  used_in_queue_id: string | null
  use_count: number
  active: boolean
  created_at: string
}

// Brand Config

export interface BrandConfig {
  id: string
  org_id: string
  brand_voice: string | null
  design_style: string | null
  primary_color: string | null
  secondary_color: string | null
  font_style: string | null
  sample_image_urls: string[]
  voice_selections: VoiceSelections
  style_selections: StyleSelections
  logo_url: string | null
  post_approval_mode: 'approve_first' | 'auto_post'
  created_at: string
  updated_at: string
}

export interface VoiceSelections {
  personality?: string
  tone?: string[]
  formality?: string
  notes?: string
}

export interface StyleSelections {
  aesthetic?: string
  color_mood?: string
  typography?: string
  notes?: string
}

export interface IntakeData {
  keywords?: string[]
  services?: { name: string; description: string }[]
  target_cities?: string[]
  highlights?: string[]
  founding_year?: string
  founding_city?: string
  service_radius?: string
  hours_of_operation?: string
  holiday_closures?: string
  business_description?: string
  additional_notes?: string
  cloud_folder_url?: string
  client_contact_phone?: string
}

// GBP Performance

export interface GBPPerformanceMetric {
  id: string
  location_id: string
  date: string
  metric: string
  value: number
  metadata: Record<string, unknown>
  created_at: string
}

// Notification Subscriptions

export type NotificationAlertType = 'new_review' | 'negative_review' | 'review_response' | 'report'
export type SubscriberType = 'all_members' | 'user' | 'email'

export interface NotificationSubscription {
  id: string
  org_id: string
  location_id: string | null
  alert_type: NotificationAlertType
  subscriber_type: SubscriberType
  subscriber_value: string | null
  created_at: string
  updated_at: string
  // joined
  location_name?: string
  subscriber_display?: string  // resolved display name (email or user name)
}

// Review Reply Queue

export type ReplyQueueStatus = 'pending' | 'sending' | 'confirmed' | 'failed'

export interface ReviewReplyQueue {
  id: string
  review_id: string
  reply_body: string
  queued_by: string
  status: ReplyQueueStatus
  attempts: number
  last_error: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}

// Profile Optimization

export type RecommendationStatus = 'pending' | 'approved' | 'client_review' | 'applied' | 'rejected'
export type RecommendationField = 'description' | 'categories' | 'attributes' | 'hours'

export interface ProfileRecommendation {
  id: string
  location_id: string
  batch_id: string
  field: RecommendationField
  current_value: unknown
  proposed_value: unknown
  ai_rationale: string | null
  status: RecommendationStatus
  requires_client_approval: boolean
  edited_value: unknown | null
  approved_by: string | null
  approved_at: string | null
  applied_at: string | null
  created_at: string
}

export interface AICorrection {
  id: string
  org_id: string
  location_id: string | null
  field: string
  original_text: string
  corrected_text: string
  context: Record<string, unknown>
  created_at: string
}

export interface AuditHistory {
  id: string
  location_id: string
  score: number
  sections: AuditSectionData[]
  created_at: string
}

export interface AuditSectionData {
  key: string
  label: string
  score: number
  maxScore: number
  status: 'good' | 'warning' | 'poor'
  suggestion: string | null
}

// Citations

export type CitationAuditStatus = 'pending' | 'running' | 'completed' | 'failed'
export type CitationListingStatus = 'found' | 'action_needed' | 'submitted' | 'verified' | 'not_listed' | 'dismissed'

export interface CitationAudit {
  id: string
  location_id: string
  brightlocal_report_id: string
  status: CitationAuditStatus
  total_found: number
  total_correct: number
  total_incorrect: number
  total_missing: number
  last_error: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface CitationListing {
  id: string
  location_id: string
  audit_id: string | null
  directory_name: string
  directory_url: string | null
  listing_url: string | null
  expected_name: string | null
  expected_address: string | null
  expected_phone: string | null
  found_name: string | null
  found_address: string | null
  found_phone: string | null
  nap_correct: boolean
  name_match: boolean
  address_match: boolean
  phone_match: boolean
  status: CitationListingStatus
  ai_recommendation: string | null
  assigned_to: string | null
  last_checked_at: string | null
  created_at: string
  updated_at: string
}

// Citation Builder

export type CitationBuilderStatus = 'lookup' | 'ready' | 'confirmed' | 'in_progress' | 'complete' | 'failed'

export interface CitationBuilderCampaign {
  id: string
  location_id: string
  brightlocal_campaign_id: string
  brightlocal_location_id: string
  status: CitationBuilderStatus
  lookup_completed_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

// Chat

export type ChatMessageRole = 'user' | 'assistant' | 'tool_call' | 'tool_result'

export interface ChatConversation {
  id: string
  user_id: string
  org_id: string | null
  location_id: string | null
  title: string | null
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  conversation_id: string
  role: ChatMessageRole
  content: string | null
  tool_name: string | null
  tool_input: Record<string, unknown> | null
  tool_result: Record<string, unknown> | null
  created_at: string
}
