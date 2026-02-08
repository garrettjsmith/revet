-- ============================================================
-- Migration: Audit log system
-- Idempotent — safe to run multiple times.
-- ============================================================

-- 1. Create audit_log table ------------------------------------

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,           -- 'location.moved', 'location.archived', 'location.created', etc.
  resource_type text NOT NULL,    -- 'location', 'organization', 'integration'
  resource_id uuid,
  metadata jsonb DEFAULT '{}',    -- action-specific data (e.g., { from_org_id, to_org_id, from_org_name, to_org_name })
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Create indexes ---------------------------------------------

CREATE INDEX IF NOT EXISTS idx_audit_log_resource
  ON audit_log(resource_type, resource_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_action_created
  ON audit_log(action, created_at DESC);

-- 3. Enable RLS and create policies -----------------------------

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency admins can view all audit logs" ON audit_log;
CREATE POLICY "Agency admins can view all audit logs"
  ON audit_log FOR SELECT
  TO authenticated
  USING (is_agency_admin());

DROP POLICY IF EXISTS "Org members can view logs for their resources" ON audit_log;
CREATE POLICY "Org members can view logs for their resources"
  ON audit_log FOR SELECT
  TO authenticated
  USING (
    -- For location resources, check if user has access to the location's org
    CASE
      WHEN resource_type = 'location' THEN
        EXISTS (
          SELECT 1 FROM locations l
          WHERE l.id = resource_id
          AND l.org_id = ANY(get_user_org_ids())
        )
      WHEN resource_type = 'organization' THEN
        resource_id = ANY(get_user_org_ids())
      ELSE false
    END
  );

-- 4. Update move_location_to_org to record audit trail ---------

CREATE OR REPLACE FUNCTION move_location_to_org(
  p_location_id uuid,
  p_new_org_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_org_id uuid;
  v_old_org_name text;
  v_new_org_name text;
BEGIN
  -- Verify caller is agency admin
  IF NOT is_agency_admin() THEN
    RAISE EXCEPTION 'Only agency admins can move locations between organizations';
  END IF;

  -- Verify new org exists
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_new_org_id) THEN
    RAISE EXCEPTION 'Target organization does not exist';
  END IF;

  -- Verify location exists and capture old org_id
  SELECT org_id INTO v_old_org_id
  FROM locations
  WHERE id = p_location_id;

  IF v_old_org_id IS NULL THEN
    RAISE EXCEPTION 'Location does not exist';
  END IF;

  -- Get org names for audit metadata
  SELECT name INTO v_old_org_name FROM organizations WHERE id = v_old_org_id;
  SELECT name INTO v_new_org_name FROM organizations WHERE id = p_new_org_id;

  -- Record audit log BEFORE making changes
  INSERT INTO audit_log (actor_id, actor_email, action, resource_type, resource_id, metadata)
  VALUES (
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    'location.moved',
    'location',
    p_location_id,
    jsonb_build_object(
      'from_org_id', v_old_org_id,
      'to_org_id', p_new_org_id,
      'from_org_name', v_old_org_name,
      'to_org_name', v_new_org_name
    )
  );

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
