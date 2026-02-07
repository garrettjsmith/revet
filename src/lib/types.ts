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
  active: boolean
  created_at: string
  updated_at: string
}

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
