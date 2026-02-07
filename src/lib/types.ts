export interface Organization {
  id: string
  name: string
  slug: string
  logo_url: string | null
  website: string | null
  created_at: string
  updated_at: string
}

export type OrgRole = 'owner' | 'admin' | 'member'

export interface OrgMember {
  id: string
  org_id: string
  user_id: string
  role: OrgRole
  created_at: string
  // joined
  org?: Organization
  email?: string
}

export interface ReviewProfile {
  id: string
  org_id: string
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
  org_name: string
  total_views: number
  total_ratings: number
  google_clicks: number
  email_clicks: number
  avg_rating: number | null
  views_7d: number
  google_clicks_7d: number
  email_clicks_7d: number
}
