-- ============================================================
-- Migration: Add org_members + org-scoped RLS
-- Idempotent — safe to run multiple times.
-- ============================================================

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

-- 3. RPC: create_organization (bypasses RLS entirely) --------------
--    Returns the new org's UUID. Owner membership is created atomically.

CREATE OR REPLACE FUNCTION create_organization(
  org_name text,
  org_slug text,
  org_website text DEFAULT NULL,
  org_logo_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO organizations (name, slug, website, logo_url)
  VALUES (org_name, org_slug, org_website, org_logo_url)
  RETURNING id INTO new_org_id;

  INSERT INTO org_members (org_id, user_id, role)
  VALUES (new_org_id, auth.uid(), 'owner')
  ON CONFLICT (org_id, user_id) DO NOTHING;

  RETURN new_org_id;
END;
$$;

-- Safety-net trigger (keeps working if someone inserts via SQL directly)
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

-- 4. Drop ALL old policies (from 001_initial and previous runs) ----

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

-- review_events — keep anon policies, drop old admin blanket
DROP POLICY IF EXISTS "Admin full access to review_events"       ON review_events;

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
--    Keep the anon SELECT from 001_initial (Public can read active profiles).
--    Replace the admin blanket with org-scoped policies.

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
--    Anon INSERT + SELECT for public funnel pages stay from 001_initial.
--    Add authenticated access scoped to org membership.

CREATE POLICY "Users can view events for their org profiles"
  ON review_events FOR SELECT
  TO authenticated
  USING (profile_id IN (
    SELECT id FROM review_profiles WHERE org_id IN (SELECT get_user_org_ids())
  ));
