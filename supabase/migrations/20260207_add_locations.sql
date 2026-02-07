-- ============================================================
-- Migration: Add locations, re-parent review_profiles,
--            agency admin, location-scoped access
-- Idempotent — safe to run multiple times.
-- ============================================================

-- 1. Location type enum -----------------------------------------------

DO $$ BEGIN
  CREATE TYPE location_type AS ENUM ('place', 'practitioner', 'service_area');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Locations table --------------------------------------------------

CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type location_type NOT NULL DEFAULT 'place',
  name text NOT NULL,
  slug text NOT NULL,

  -- Google Business Profile
  place_id text,                    -- nullable for SABs without a listing

  -- Contact
  phone text,
  email text,                       -- primary contact / alert recipient
  timezone text DEFAULT 'America/New_York',

  -- Address (nullable for SABs that hide address)
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text DEFAULT 'US',

  -- Type-specific extras (practitioner credentials, SAB service area, etc.)
  metadata jsonb DEFAULT '{}',

  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(org_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_locations_org ON locations(org_id);

-- Updated_at trigger
CREATE TRIGGER locations_updated_at
  BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. Re-parent review_profiles → locations ----------------------------

ALTER TABLE review_profiles ADD COLUMN IF NOT EXISTS location_id uuid
  REFERENCES locations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_review_profiles_location ON review_profiles(location_id);

-- Migrate existing profiles: create a location per distinct (org, place_id)
INSERT INTO locations (org_id, type, name, slug, place_id, email)
SELECT DISTINCT ON (rp.org_id, rp.place_id)
  rp.org_id,
  'place'::location_type,
  rp.name,
  lower(regexp_replace(rp.name, '[^a-zA-Z0-9]+', '-', 'g')),
  rp.place_id,
  rp.manager_email
FROM review_profiles rp
WHERE rp.location_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM locations l WHERE l.org_id = rp.org_id AND l.place_id = rp.place_id
  );

-- Link orphaned profiles to their auto-created locations
UPDATE review_profiles rp
SET location_id = l.id
FROM locations l
WHERE l.org_id = rp.org_id
  AND l.place_id = rp.place_id
  AND rp.location_id IS NULL;

-- 4. Agency admin + location-scoped access on org_members -------------

ALTER TABLE org_members ADD COLUMN IF NOT EXISTS is_agency_admin boolean
  NOT NULL DEFAULT false;

ALTER TABLE org_members ADD COLUMN IF NOT EXISTS location_access text
  NOT NULL DEFAULT 'all'
  CHECK (location_access IN ('all', 'specific'));

-- Join table: which locations a member with 'specific' access can see
CREATE TABLE IF NOT EXISTS org_member_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_member_id uuid NOT NULL REFERENCES org_members(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  UNIQUE(org_member_id, location_id)
);

-- 5. SECURITY DEFINER helpers ----------------------------------------

-- Locations the current user can access (respects location_access)
CREATE OR REPLACE FUNCTION get_user_location_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT l.id
  FROM locations l
  INNER JOIN org_members om ON om.org_id = l.org_id
  WHERE om.user_id = auth.uid()
    AND (
      om.location_access = 'all'
      OR l.id IN (
        SELECT oml.location_id
        FROM org_member_locations oml
        WHERE oml.org_member_id = om.id
      )
    );
$$;

-- Check if the current user is an agency admin
CREATE OR REPLACE FUNCTION is_agency_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE user_id = auth.uid() AND is_agency_admin = true
  );
$$;

-- 6. RLS for locations ------------------------------------------------

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their locations"        ON locations;
DROP POLICY IF EXISTS "Admins can insert locations"           ON locations;
DROP POLICY IF EXISTS "Admins can update locations"           ON locations;
DROP POLICY IF EXISTS "Admins can delete locations"           ON locations;

CREATE POLICY "Users can view their locations"
  ON locations FOR SELECT
  TO authenticated
  USING (id IN (SELECT get_user_location_ids()));

CREATE POLICY "Admins can insert locations"
  ON locations FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT get_user_admin_org_ids()));

CREATE POLICY "Admins can update locations"
  ON locations FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT get_user_admin_org_ids()));

CREATE POLICY "Admins can delete locations"
  ON locations FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT get_user_admin_org_ids()));

-- 7. RLS for org_member_locations -------------------------------------

ALTER TABLE org_member_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their location assignments" ON org_member_locations;
DROP POLICY IF EXISTS "Admins can manage location assignments"   ON org_member_locations;

CREATE POLICY "Users can view their location assignments"
  ON org_member_locations FOR SELECT
  TO authenticated
  USING (org_member_id IN (
    SELECT id FROM org_members WHERE org_id IN (SELECT get_user_org_ids())
  ));

CREATE POLICY "Admins can manage location assignments"
  ON org_member_locations FOR ALL
  TO authenticated
  USING (org_member_id IN (
    SELECT id FROM org_members WHERE org_id IN (SELECT get_user_admin_org_ids())
  ))
  WITH CHECK (org_member_id IN (
    SELECT id FROM org_members WHERE org_id IN (SELECT get_user_admin_org_ids())
  ));

-- 8. Update review_profiles RLS to respect location scope -------------
--    Users with 'specific' access should only see profiles in their locations.

DROP POLICY IF EXISTS "Users can view profiles in their orgs"    ON review_profiles;
DROP POLICY IF EXISTS "Users can insert profiles in their orgs"  ON review_profiles;
DROP POLICY IF EXISTS "Users can update profiles in their orgs"  ON review_profiles;
DROP POLICY IF EXISTS "Users can delete profiles in their orgs"  ON review_profiles;

CREATE POLICY "Users can view profiles in their orgs"
  ON review_profiles FOR SELECT
  TO authenticated
  USING (
    org_id IN (SELECT get_user_org_ids())
    AND (
      location_id IS NULL
      OR location_id IN (SELECT get_user_location_ids())
    )
  );

CREATE POLICY "Users can insert profiles in their orgs"
  ON review_profiles FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT get_user_admin_org_ids()));

CREATE POLICY "Users can update profiles in their orgs"
  ON review_profiles FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT get_user_admin_org_ids()));

CREATE POLICY "Users can delete profiles in their orgs"
  ON review_profiles FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT get_user_admin_org_ids()));

-- 9. Update profile_stats view to include location_id ----------------

CREATE OR REPLACE VIEW public.profile_stats AS
SELECT
  rp.id AS profile_id,
  rp.name AS profile_name,
  rp.slug,
  rp.org_id,
  rp.location_id,
  o.name AS org_name,
  l.name AS location_name,
  count(*) FILTER (WHERE re.event_type = 'page_view') AS total_views,
  count(*) FILTER (WHERE re.event_type = 'rating_submitted') AS total_ratings,
  count(*) FILTER (WHERE re.event_type = 'google_click') AS google_clicks,
  count(*) FILTER (WHERE re.event_type = 'email_click') AS email_clicks,
  round(avg(re.rating) FILTER (WHERE re.rating IS NOT NULL), 1) AS avg_rating,
  count(*) FILTER (WHERE re.event_type = 'page_view' AND re.created_at > now() - interval '7 days') AS views_7d,
  count(*) FILTER (WHERE re.event_type = 'google_click' AND re.created_at > now() - interval '7 days') AS google_clicks_7d,
  count(*) FILTER (WHERE re.event_type = 'email_click' AND re.created_at > now() - interval '7 days') AS email_clicks_7d
FROM review_profiles rp
LEFT JOIN review_events re ON re.profile_id = rp.id
LEFT JOIN organizations o ON o.id = rp.org_id
LEFT JOIN locations l ON l.id = rp.location_id
GROUP BY rp.id, rp.name, rp.slug, rp.org_id, rp.location_id, o.name, l.name;
