-- ============================================================
-- FIXUP: Paste this entire script into Supabase SQL Editor.
-- It cleans up stale data from previous attempts, then sets up
-- org_members + org-scoped RLS correctly.
-- Safe to run multiple times.
-- ============================================================

-- 0. Clean up stale data from failed attempts --------------------
--    Delete orphan org_members rows, then orphan organizations
--    that have no members (leftover from partial creates).
DELETE FROM org_members WHERE org_id NOT IN (SELECT id FROM organizations);
DELETE FROM organizations WHERE id NOT IN (
  SELECT DISTINCT org_id FROM review_profiles
) AND id NOT IN (
  SELECT DISTINCT org_id FROM org_members
);

-- 1. Schema changes ------------------------------------------------

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website text;

CREATE TABLE IF NOT EXISTS org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON org_members(org_id);

-- 2. SECURITY DEFINER helpers (bypass RLS to avoid recursion) ------

CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT org_id FROM org_members WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_user_admin_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin');
$$;

CREATE OR REPLACE FUNCTION get_user_owner_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role = 'owner';
$$;

-- 3. Auto-create owner membership on org creation ------------------

CREATE OR REPLACE FUNCTION auto_add_org_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO org_members (org_id, user_id, role)
  VALUES (NEW.id, auth.uid(), 'owner')
  ON CONFLICT (org_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_org_created ON organizations;
CREATE TRIGGER on_org_created
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION auto_add_org_owner();

-- 4. Drop ALL old policies -----------------------------------------

-- organizations
DROP POLICY IF EXISTS "Admin full access to organizations"       ON organizations;
DROP POLICY IF EXISTS "Users can view their organizations"       ON organizations;
DROP POLICY IF EXISTS "Owners and admins can update orgs"        ON organizations;
DROP POLICY IF EXISTS "Authenticated users can create orgs"      ON organizations;

-- org_members
DROP POLICY IF EXISTS "Users can view members of their orgs"     ON org_members;
DROP POLICY IF EXISTS "Owners and admins can add members"        ON org_members;
DROP POLICY IF EXISTS "Owners can update member roles"           ON org_members;
DROP POLICY IF EXISTS "Owners and admins can remove members"     ON org_members;

-- review_profiles (old blanket + new scoped)
DROP POLICY IF EXISTS "Admin full access to review_profiles"     ON review_profiles;
DROP POLICY IF EXISTS "Users can view profiles in their orgs"    ON review_profiles;
DROP POLICY IF EXISTS "Users can manage profiles in their orgs"  ON review_profiles;
DROP POLICY IF EXISTS "Users can insert profiles in their orgs"  ON review_profiles;
DROP POLICY IF EXISTS "Users can update profiles in their orgs"  ON review_profiles;
DROP POLICY IF EXISTS "Users can delete profiles in their orgs"  ON review_profiles;

-- review_events — keep anon policies, drop old admin blanket
DROP POLICY IF EXISTS "Admin full access to review_events"       ON review_events;
DROP POLICY IF EXISTS "Users can view events for their org profiles" ON review_events;

-- 5. Enable RLS ----------------------------------------------------

ALTER TABLE org_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_events  ENABLE ROW LEVEL SECURITY;

-- 6. New policies: organizations -----------------------------------

CREATE POLICY "Users can view their organizations"
  ON organizations FOR SELECT
  USING (id IN (SELECT get_user_org_ids()));

CREATE POLICY "Authenticated users can create orgs"
  ON organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Owners and admins can update orgs"
  ON organizations FOR UPDATE
  USING (id IN (SELECT get_user_admin_org_ids()));

-- 7. New policies: org_members -------------------------------------

CREATE POLICY "Users can view members of their orgs"
  ON org_members FOR SELECT
  USING (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY "Owners and admins can add members"
  ON org_members FOR INSERT
  WITH CHECK (org_id IN (SELECT get_user_admin_org_ids()));

CREATE POLICY "Owners can update member roles"
  ON org_members FOR UPDATE
  USING (org_id IN (SELECT get_user_owner_org_ids()));

CREATE POLICY "Owners and admins can remove members"
  ON org_members FOR DELETE
  USING (org_id IN (SELECT get_user_admin_org_ids()));

-- 8. New policies: review_profiles ---------------------------------

CREATE POLICY "Users can view profiles in their orgs"
  ON review_profiles FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

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

-- 9. New policies: review_events -----------------------------------

CREATE POLICY "Users can view events for their org profiles"
  ON review_events FOR SELECT
  TO authenticated
  USING (profile_id IN (
    SELECT id FROM review_profiles WHERE org_id IN (SELECT get_user_org_ids())
  ));

-- ============================================================
-- Done. You can now create organizations from the app.
-- ============================================================
