-- Citation Builder campaigns via BrightLocal Management API
-- Tracks CB campaigns created per location after citation audit

-- ─── Add campaign ID to locations ───────────────────────────
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS brightlocal_campaign_id text;

-- ─── Citation Builder campaigns table ───────────────────────
CREATE TABLE IF NOT EXISTS citation_builder_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  brightlocal_campaign_id text NOT NULL,
  brightlocal_location_id text NOT NULL,
  status text NOT NULL DEFAULT 'lookup'
    CHECK (status IN ('lookup', 'ready', 'confirmed', 'in_progress', 'complete', 'failed')),
  lookup_completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cb_campaigns_location ON citation_builder_campaigns(location_id);
CREATE INDEX IF NOT EXISTS idx_cb_campaigns_status ON citation_builder_campaigns(status)
  WHERE status IN ('lookup', 'ready', 'in_progress');

-- Updated_at trigger
DO $$ BEGIN
  CREATE TRIGGER citation_builder_campaigns_updated_at
    BEFORE UPDATE ON citation_builder_campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── RLS ────────────────────────────────────────────────────

ALTER TABLE citation_builder_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cb_campaigns_select" ON citation_builder_campaigns;
CREATE POLICY "cb_campaigns_select" ON citation_builder_campaigns
  FOR SELECT USING (
    location_id IN (SELECT get_user_location_ids())
  );

-- Mutations go through admin client (service role)
