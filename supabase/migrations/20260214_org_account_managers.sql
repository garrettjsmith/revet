-- Org account managers: maps agency team members to the organizations they manage
--
-- An org can have multiple account managers. An account manager can manage
-- multiple orgs. This drives work queue filtering and digest routing.

CREATE TABLE IF NOT EXISTS org_account_managers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

-- RLS
ALTER TABLE org_account_managers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency admins can manage account managers" ON org_account_managers;
CREATE POLICY "Agency admins can manage account managers"
  ON org_account_managers FOR ALL
  USING (is_agency_admin())
  WITH CHECK (is_agency_admin());

DROP POLICY IF EXISTS "Account managers can view their assignments" ON org_account_managers;
CREATE POLICY "Account managers can view their assignments"
  ON org_account_managers FOR SELECT
  USING (user_id = auth.uid());

-- Helper function: get org IDs managed by the current user
CREATE OR REPLACE FUNCTION get_managed_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM org_account_managers WHERE user_id = auth.uid()
$$;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_org_account_managers_user_id
  ON org_account_managers(user_id);
CREATE INDEX IF NOT EXISTS idx_org_account_managers_org_id
  ON org_account_managers(org_id);
