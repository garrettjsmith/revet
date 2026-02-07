-- ============================================================
-- Migration: Agency enhancements — org status, integrations
-- Idempotent — safe to run multiple times.
-- ============================================================

-- 1. Add status to organizations ----------------------------------

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status text
  NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'lead', 'paused', 'churned'));

-- 2. Agency integrations (OAuth connections) ----------------------

CREATE TABLE IF NOT EXISTS agency_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,           -- 'google', 'local_falcon', etc.
  account_email text,               -- the connected account identifier
  status text NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'disconnected', 'error')),
  metadata jsonb DEFAULT '{}',      -- provider-specific data (scopes, property counts, etc.)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider)
);

CREATE TRIGGER agency_integrations_updated_at
  BEFORE UPDATE ON agency_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. Integration resource mappings --------------------------------

CREATE TABLE IF NOT EXISTS agency_integration_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES agency_integrations(id) ON DELETE CASCADE,
  external_resource_id text NOT NULL,     -- provider ID (GSC property URL, GBP location name/id, etc.)
  external_resource_name text,            -- human-readable name
  resource_type text NOT NULL,            -- 'gsc_property', 'ga_property', 'gbp_location', 'ads_account'
  org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(integration_id, external_resource_id)
);

CREATE INDEX IF NOT EXISTS idx_agency_integration_mappings_org ON agency_integration_mappings(org_id);
CREATE INDEX IF NOT EXISTS idx_agency_integration_mappings_location ON agency_integration_mappings(location_id);

-- 4. RLS for agency tables ----------------------------------------

ALTER TABLE agency_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_integration_mappings ENABLE ROW LEVEL SECURITY;

-- Only agency admins can manage integrations
DROP POLICY IF EXISTS "Agency admins can manage integrations" ON agency_integrations;
CREATE POLICY "Agency admins can manage integrations"
  ON agency_integrations FOR ALL
  TO authenticated
  USING (is_agency_admin())
  WITH CHECK (is_agency_admin());

DROP POLICY IF EXISTS "Agency admins can manage mappings" ON agency_integration_mappings;
CREATE POLICY "Agency admins can manage mappings"
  ON agency_integration_mappings FOR ALL
  TO authenticated
  USING (is_agency_admin())
  WITH CHECK (is_agency_admin());

-- 5. Update RLS helpers so agency admins see all orgs/locations ---

CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT org_id FROM org_members WHERE user_id = auth.uid()
  UNION
  SELECT id FROM organizations
  WHERE EXISTS (
    SELECT 1 FROM org_members
    WHERE user_id = auth.uid() AND is_agency_admin = true
  );
$$;

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
    )
  UNION
  SELECT id FROM locations
  WHERE EXISTS (
    SELECT 1 FROM org_members
    WHERE user_id = auth.uid() AND is_agency_admin = true
  );
$$;
