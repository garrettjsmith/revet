-- LocalFalcon geo-grid scan results
CREATE TABLE IF NOT EXISTS local_falcon_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  report_key text NOT NULL,
  keyword text NOT NULL,
  grid_size int NOT NULL DEFAULT 49,   -- total points (e.g. 49 for 7x7)
  radius_km numeric,
  solv numeric,                         -- Share of Local Voice (0-100%)
  arp numeric,                          -- Average Rank Position
  atrp numeric,                         -- Average Total Rank Position
  grid_data jsonb NOT NULL DEFAULT '[]', -- array of {lat,lng,rank} points
  competitors jsonb DEFAULT '[]',       -- top competitors with their SoLV/ARP
  scanned_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(location_id, report_key)
);

CREATE INDEX IF NOT EXISTS idx_lf_scans_location
  ON local_falcon_scans(location_id, scanned_at DESC);

CREATE INDEX IF NOT EXISTS idx_lf_scans_keyword
  ON local_falcon_scans(location_id, keyword, scanned_at DESC);

-- GBP search keyword impressions (monthly)
CREATE TABLE IF NOT EXISTS gbp_search_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  year int NOT NULL,
  month int NOT NULL,
  keyword text NOT NULL,
  impressions bigint,      -- NULL if below threshold
  threshold bigint,        -- NULL if actual value available
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(location_id, year, month, keyword)
);

CREATE INDEX IF NOT EXISTS idx_gbp_keywords_location_period
  ON gbp_search_keywords(location_id, year DESC, month DESC);

-- RLS policies
ALTER TABLE local_falcon_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE gbp_search_keywords ENABLE ROW LEVEL SECURITY;

-- local_falcon_scans: agency admins can manage, org members can read
DROP POLICY IF EXISTS "agency_admin_manage_lf_scans" ON local_falcon_scans;
CREATE POLICY "agency_admin_manage_lf_scans" ON local_falcon_scans
  FOR ALL USING (
    location_id IN (SELECT get_user_location_ids())
  );

-- gbp_search_keywords: agency admins can manage, org members can read
DROP POLICY IF EXISTS "agency_admin_manage_gbp_keywords" ON gbp_search_keywords;
CREATE POLICY "agency_admin_manage_gbp_keywords" ON gbp_search_keywords
  FOR ALL USING (
    location_id IN (SELECT get_user_location_ids())
  );
