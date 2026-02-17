-- Citation auditing via BrightLocal Citation Tracker
-- Tracks citation audit runs and individual directory listings per location

-- ─── BrightLocal mapping on locations ────────────────────────
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS brightlocal_report_id text;

-- ─── Citation audits (one row per audit run per location) ────
CREATE TABLE citation_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  brightlocal_report_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  total_found integer NOT NULL DEFAULT 0,
  total_correct integer NOT NULL DEFAULT 0,
  total_incorrect integer NOT NULL DEFAULT 0,
  total_missing integer NOT NULL DEFAULT 0,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_citation_audits_location ON citation_audits(location_id);
CREATE INDEX idx_citation_audits_status ON citation_audits(status)
  WHERE status IN ('pending', 'running');

-- ─── Citation listings (one row per directory per location) ──
CREATE TABLE citation_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  audit_id uuid REFERENCES citation_audits(id) ON DELETE SET NULL,
  directory_name text NOT NULL,
  directory_url text,
  listing_url text,
  -- Expected NAP (from our location record)
  expected_name text,
  expected_address text,
  expected_phone text,
  -- Found NAP (from directory)
  found_name text,
  found_address text,
  found_phone text,
  -- Match status
  nap_correct boolean NOT NULL DEFAULT false,
  name_match boolean NOT NULL DEFAULT false,
  address_match boolean NOT NULL DEFAULT false,
  phone_match boolean NOT NULL DEFAULT false,
  -- Action tracking
  status text NOT NULL DEFAULT 'found'
    CHECK (status IN ('found', 'action_needed', 'submitted', 'verified', 'not_listed', 'dismissed')),
  ai_recommendation text,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- One listing per directory per location
  UNIQUE (location_id, directory_name)
);

CREATE INDEX idx_citation_listings_location ON citation_listings(location_id);
CREATE INDEX idx_citation_listings_action ON citation_listings(status)
  WHERE status IN ('action_needed', 'submitted');
CREATE INDEX idx_citation_listings_audit ON citation_listings(audit_id);

-- ─── RLS policies ────────────────────────────────────────────

ALTER TABLE citation_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE citation_listings ENABLE ROW LEVEL SECURITY;

-- Citation audits: members can view for their locations
DROP POLICY IF EXISTS "citation_audits_select" ON citation_audits;
CREATE POLICY "citation_audits_select" ON citation_audits
  FOR SELECT USING (
    location_id IN (SELECT get_user_location_ids())
  );

-- Citation listings: members can view for their locations
DROP POLICY IF EXISTS "citation_listings_select" ON citation_listings;
CREATE POLICY "citation_listings_select" ON citation_listings
  FOR SELECT USING (
    location_id IN (SELECT get_user_location_ids())
  );

-- Mutations go through admin client (service role), no INSERT/UPDATE policies needed
