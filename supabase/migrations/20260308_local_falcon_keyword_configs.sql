-- ============================================================
-- Migration: LocalFalcon keyword scan configuration
--
-- Stores which keywords each location should be rank-tracked for
-- in LocalFalcon. When a keyword is added, the app creates a
-- campaign in LocalFalcon's API for recurring scans.
-- ============================================================

CREATE TABLE IF NOT EXISTS local_falcon_keyword_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  campaign_id text,
  grid_size integer NOT NULL DEFAULT 49,
  radius_km numeric NOT NULL DEFAULT 8,
  frequency text NOT NULL DEFAULT 'weekly'
    CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(location_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_lf_keyword_configs_location
  ON local_falcon_keyword_configs(location_id);

CREATE TRIGGER local_falcon_keyword_configs_updated_at
  BEFORE UPDATE ON local_falcon_keyword_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE local_falcon_keyword_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view keyword configs for their locations" ON local_falcon_keyword_configs;
CREATE POLICY "Users can view keyword configs for their locations"
  ON local_falcon_keyword_configs FOR SELECT
  TO authenticated
  USING (location_id IN (SELECT get_user_location_ids()));

DROP POLICY IF EXISTS "Agency admins can manage keyword configs" ON local_falcon_keyword_configs;
CREATE POLICY "Agency admins can manage keyword configs"
  ON local_falcon_keyword_configs FOR ALL
  TO authenticated
  USING (is_agency_admin())
  WITH CHECK (is_agency_admin());
