-- ============================================================
-- Migration: Location lifecycle — move, discovery, status
-- Idempotent — safe to run multiple times.
-- ============================================================

-- 1. RPC: move_location_to_org (SECURITY DEFINER) ------------------
--    Atomically moves a location from one org to another.
--    Only callable by agency admins.

CREATE OR REPLACE FUNCTION move_location_to_org(
  p_location_id uuid,
  p_new_org_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is agency admin
  IF NOT is_agency_admin() THEN
    RAISE EXCEPTION 'Only agency admins can move locations between organizations';
  END IF;

  -- Verify new org exists
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_new_org_id) THEN
    RAISE EXCEPTION 'Target organization does not exist';
  END IF;

  -- Verify location exists
  IF NOT EXISTS (SELECT 1 FROM locations WHERE id = p_location_id) THEN
    RAISE EXCEPTION 'Location does not exist';
  END IF;

  -- Update location org
  UPDATE locations
  SET org_id = p_new_org_id
  WHERE id = p_location_id;

  -- Update any integration mappings
  UPDATE agency_integration_mappings
  SET org_id = p_new_org_id
  WHERE location_id = p_location_id;

  -- Update review profiles
  UPDATE review_profiles
  SET org_id = p_new_org_id
  WHERE location_id = p_location_id;

  RETURN p_location_id;
END;
$$;

-- 2. Discovered resources table ------------------------------------
--    Tracks resources discovered from integrations before mapping.

CREATE TABLE IF NOT EXISTS discovered_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES agency_integrations(id) ON DELETE CASCADE,
  external_resource_id text NOT NULL,
  external_resource_name text,
  resource_type text NOT NULL DEFAULT 'gbp_location',
  raw_data jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'mapped', 'ignored')),
  discovered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(integration_id, external_resource_id)
);

CREATE INDEX IF NOT EXISTS idx_discovered_resources_integration_status
  ON discovered_resources(integration_id, status);

-- 3. RLS for discovered_resources -----------------------------------

ALTER TABLE discovered_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency admins can manage discovered resources" ON discovered_resources;
CREATE POLICY "Agency admins can manage discovered resources"
  ON discovered_resources FOR ALL
  TO authenticated
  USING (is_agency_admin())
  WITH CHECK (is_agency_admin());

-- 4. Location status enum -------------------------------------------
--    Replaces the boolean `active` column with a status enum.

-- Add status column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'locations' AND column_name = 'status'
  ) THEN
    ALTER TABLE locations ADD COLUMN status text NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'paused', 'archived'));
  END IF;
END $$;

-- Backfill status from active boolean
-- Only update rows that still have the default 'active' status but have active=false
UPDATE locations
SET status = 'archived'
WHERE active = false AND status = 'active';

-- Note: We keep the `active` column for backward compatibility.
-- Applications should migrate to use `status` instead.
-- In a future migration, we can drop the `active` column.
