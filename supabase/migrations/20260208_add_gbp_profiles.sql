-- ============================================================
-- Migration: GBP profile data model
-- Stores full Google Business Profile data for locations.
-- Tables: gbp_profiles (1:1), gbp_media (1:many), gbp_posts (1:many)
-- Idempotent — safe to run multiple times.
-- ============================================================

-- 1. GBP Profiles (1:1 with locations) -----------------------

CREATE TABLE IF NOT EXISTS gbp_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,

  -- Google resource identifiers
  gbp_location_name text NOT NULL,          -- "locations/abc123"
  gbp_account_name text,                    -- "accounts/123"

  -- Core profile fields (structured for querying/display)
  business_name text,
  description text,
  website_uri text,
  phone_primary text,
  primary_category_id text,                 -- "gcid:dental_clinic"
  primary_category_name text,               -- "Dental Clinic"
  open_status text DEFAULT 'OPEN'
    CHECK (open_status IS NULL OR open_status IN (
      'OPEN', 'CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY'
    )),
  verification_state text
    CHECK (verification_state IS NULL OR verification_state IN (
      'VERIFIED', 'UNVERIFIED', 'VERIFICATION_REQUESTED'
    )),
  latitude double precision,
  longitude double precision,
  maps_uri text,
  new_review_uri text,
  has_pending_edits boolean DEFAULT false,
  has_google_updated boolean DEFAULT false,

  -- Complex/nested data (JSONB — displayed, not queried)
  additional_categories jsonb DEFAULT '[]',
  regular_hours jsonb DEFAULT '{}',
  special_hours jsonb DEFAULT '[]',
  more_hours jsonb DEFAULT '[]',
  additional_phones jsonb DEFAULT '[]',
  address jsonb DEFAULT '{}',
  service_area jsonb DEFAULT '{}',
  attributes jsonb DEFAULT '[]',
  labels jsonb DEFAULT '[]',
  service_items jsonb DEFAULT '[]',

  -- Sync tracking
  sync_status text NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'active', 'error', 'paused')),
  last_synced_at timestamptz,
  last_pushed_at timestamptz,
  sync_error text,
  raw_google_data jsonb DEFAULT '{}',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(location_id),
  UNIQUE(gbp_location_name)
);

CREATE INDEX IF NOT EXISTS idx_gbp_profiles_location ON gbp_profiles(location_id);
CREATE INDEX IF NOT EXISTS idx_gbp_profiles_category ON gbp_profiles(primary_category_id);
CREATE INDEX IF NOT EXISTS idx_gbp_profiles_sync ON gbp_profiles(sync_status);

CREATE TRIGGER gbp_profiles_updated_at
  BEFORE UPDATE ON gbp_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2. GBP Media (photos/videos per location) -------------------

CREATE TABLE IF NOT EXISTS gbp_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  gbp_media_name text NOT NULL,
  media_format text NOT NULL CHECK (media_format IN ('PHOTO', 'VIDEO')),
  category text,
  description text,
  google_url text,
  thumbnail_url text,
  width_px integer,
  height_px integer,
  source_account text,
  create_time timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(location_id, gbp_media_name)
);

CREATE INDEX IF NOT EXISTS idx_gbp_media_location ON gbp_media(location_id);

-- 3. GBP Posts (local posts per location) ---------------------

CREATE TABLE IF NOT EXISTS gbp_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  gbp_post_name text NOT NULL,
  topic_type text NOT NULL CHECK (topic_type IN ('STANDARD', 'EVENT', 'OFFER', 'ALERT')),
  summary text,
  action_type text,
  action_url text,
  media_url text,
  event_title text,
  event_start timestamptz,
  event_end timestamptz,
  offer_coupon_code text,
  offer_terms text,
  state text NOT NULL DEFAULT 'LIVE' CHECK (state IN ('LIVE', 'REJECTED', 'PROCESSING')),
  search_url text,
  create_time timestamptz,
  update_time timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(location_id, gbp_post_name)
);

CREATE INDEX IF NOT EXISTS idx_gbp_posts_location ON gbp_posts(location_id);
CREATE INDEX IF NOT EXISTS idx_gbp_posts_create ON gbp_posts(location_id, create_time DESC);

CREATE TRIGGER gbp_posts_updated_at
  BEFORE UPDATE ON gbp_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4. RLS policies ---------------------------------------------

ALTER TABLE gbp_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE gbp_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE gbp_posts ENABLE ROW LEVEL SECURITY;

-- gbp_profiles
DROP POLICY IF EXISTS "Users can view GBP profiles" ON gbp_profiles;
CREATE POLICY "Users can view GBP profiles"
  ON gbp_profiles FOR SELECT
  TO authenticated
  USING (location_id IN (SELECT get_user_location_ids()));

DROP POLICY IF EXISTS "Agency admins can manage GBP profiles" ON gbp_profiles;
CREATE POLICY "Agency admins can manage GBP profiles"
  ON gbp_profiles FOR ALL
  TO authenticated
  USING (is_agency_admin())
  WITH CHECK (is_agency_admin());

-- gbp_media
DROP POLICY IF EXISTS "Users can view GBP media" ON gbp_media;
CREATE POLICY "Users can view GBP media"
  ON gbp_media FOR SELECT
  TO authenticated
  USING (location_id IN (SELECT get_user_location_ids()));

DROP POLICY IF EXISTS "Agency admins can manage GBP media" ON gbp_media;
CREATE POLICY "Agency admins can manage GBP media"
  ON gbp_media FOR ALL
  TO authenticated
  USING (is_agency_admin())
  WITH CHECK (is_agency_admin());

-- gbp_posts
DROP POLICY IF EXISTS "Users can view GBP posts" ON gbp_posts;
CREATE POLICY "Users can view GBP posts"
  ON gbp_posts FOR SELECT
  TO authenticated
  USING (location_id IN (SELECT get_user_location_ids()));

DROP POLICY IF EXISTS "Agency admins can manage GBP posts" ON gbp_posts;
CREATE POLICY "Agency admins can manage GBP posts"
  ON gbp_posts FOR ALL
  TO authenticated
  USING (is_agency_admin())
  WITH CHECK (is_agency_admin());
