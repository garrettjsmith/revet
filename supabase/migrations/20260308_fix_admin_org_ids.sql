-- Fix get_user_admin_org_ids() to account for agency admins.
-- Previously only returned orgs where user had role IN ('owner', 'admin').
-- Agency admins (is_agency_admin = true) should see ALL organizations,
-- matching the behavior of get_user_org_ids() and get_user_location_ids().

CREATE OR REPLACE FUNCTION get_user_admin_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  UNION
  SELECT id FROM organizations
  WHERE EXISTS (
    SELECT 1 FROM org_members
    WHERE user_id = auth.uid() AND is_agency_admin = true
  );
$$;
