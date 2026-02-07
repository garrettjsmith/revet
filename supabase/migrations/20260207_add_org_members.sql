-- Expand organizations table with additional fields
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website text;

-- Create org_members table for user-to-org membership
CREATE TABLE IF NOT EXISTS org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON org_members(org_id);

-- Helper function to get org IDs for the current user (bypasses RLS)
CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT org_id FROM org_members WHERE user_id = auth.uid();
$$;

-- Helper function to get org IDs where user is owner or admin (bypasses RLS)
CREATE OR REPLACE FUNCTION get_user_admin_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin');
$$;

-- Helper function to get org IDs where user is owner (bypasses RLS)
CREATE OR REPLACE FUNCTION get_user_owner_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role = 'owner';
$$;

-- RLS policies for org_members
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

-- Users can see memberships for orgs they belong to (no self-reference)
DROP POLICY IF EXISTS "Users can view members of their orgs" ON org_members;
CREATE POLICY "Users can view members of their orgs"
  ON org_members FOR SELECT
  USING (org_id IN (SELECT get_user_org_ids()));

-- Only owners/admins can insert new members
DROP POLICY IF EXISTS "Owners and admins can add members" ON org_members;
CREATE POLICY "Owners and admins can add members"
  ON org_members FOR INSERT
  WITH CHECK (org_id IN (SELECT get_user_admin_org_ids()));

-- Only owners can update roles
DROP POLICY IF EXISTS "Owners can update member roles" ON org_members;
CREATE POLICY "Owners can update member roles"
  ON org_members FOR UPDATE
  USING (org_id IN (SELECT get_user_owner_org_ids()));

-- Owners/admins can remove members
DROP POLICY IF EXISTS "Owners and admins can remove members" ON org_members;
CREATE POLICY "Owners and admins can remove members"
  ON org_members FOR DELETE
  USING (org_id IN (SELECT get_user_admin_org_ids()));

-- Enable RLS on organizations if not already
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Update organizations RLS: users can only see orgs they belong to
DROP POLICY IF EXISTS "Users can view their organizations" ON organizations;
CREATE POLICY "Users can view their organizations"
  ON organizations FOR SELECT
  USING (id IN (SELECT get_user_org_ids()));

-- Owners/admins can update their orgs
DROP POLICY IF EXISTS "Owners and admins can update orgs" ON organizations;
CREATE POLICY "Owners and admins can update orgs"
  ON organizations FOR UPDATE
  USING (id IN (SELECT get_user_admin_org_ids()));

-- Any authenticated user can create an org (they become the owner)
DROP POLICY IF EXISTS "Authenticated users can create orgs" ON organizations;
CREATE POLICY "Authenticated users can create orgs"
  ON organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Auto-create owner membership when an org is created
CREATE OR REPLACE FUNCTION auto_add_org_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO org_members (org_id, user_id, role)
  VALUES (NEW.id, auth.uid(), 'owner');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_org_created ON organizations;
CREATE TRIGGER on_org_created
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION auto_add_org_owner();

-- Update review_profiles RLS: scope to org membership
DROP POLICY IF EXISTS "Users can view profiles in their orgs" ON review_profiles;
CREATE POLICY "Users can view profiles in their orgs"
  ON review_profiles FOR SELECT
  USING (org_id IN (SELECT get_user_org_ids()));

DROP POLICY IF EXISTS "Users can manage profiles in their orgs" ON review_profiles;
CREATE POLICY "Users can manage profiles in their orgs"
  ON review_profiles FOR ALL
  USING (org_id IN (SELECT get_user_admin_org_ids()));
