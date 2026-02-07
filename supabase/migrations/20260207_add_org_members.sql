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

-- RLS policies for org_members
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

-- Users can see memberships for orgs they belong to
CREATE POLICY "Users can view members of their orgs"
  ON org_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- Only owners/admins can insert new members
CREATE POLICY "Owners and admins can add members"
  ON org_members FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Only owners can update roles
CREATE POLICY "Owners can update member roles"
  ON org_members FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- Owners/admins can remove members (but not the last owner)
CREATE POLICY "Owners and admins can remove members"
  ON org_members FOR DELETE
  USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Update organizations RLS: users can only see orgs they belong to
DROP POLICY IF EXISTS "Users can view their organizations" ON organizations;
CREATE POLICY "Users can view their organizations"
  ON organizations FOR SELECT
  USING (
    id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- Owners/admins can update their orgs
DROP POLICY IF EXISTS "Owners and admins can update orgs" ON organizations;
CREATE POLICY "Owners and admins can update orgs"
  ON organizations FOR UPDATE
  USING (
    id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Any authenticated user can create an org (they become the owner)
DROP POLICY IF EXISTS "Authenticated users can create orgs" ON organizations;
CREATE POLICY "Authenticated users can create orgs"
  ON organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Update review_profiles RLS: scope to org membership
DROP POLICY IF EXISTS "Users can view profiles in their orgs" ON review_profiles;
CREATE POLICY "Users can view profiles in their orgs"
  ON review_profiles FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can manage profiles in their orgs" ON review_profiles;
CREATE POLICY "Users can manage profiles in their orgs"
  ON review_profiles FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Enable RLS on organizations if not already
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
