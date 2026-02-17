-- ============================================================
-- Migration: Post auto-generation system
--
-- 1. gbp_post_topics — topic pool per location
-- 2. brand_config — org-level brand voice + design config
-- 3. Brand override columns on locations
-- 4. posts_per_month on locations
-- 5. Extend gbp_post_queue status for two-stage approval
-- 6. Add topic_id FK on gbp_post_queue
-- ============================================================

-- 1. Topic pool table ---------------------------------------------------

CREATE TABLE IF NOT EXISTS gbp_post_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  topic text NOT NULL,
  source text NOT NULL DEFAULT 'ai'
    CHECK (source IN ('ai', 'manual')),
  used_at timestamptz,
  used_in_queue_id uuid REFERENCES gbp_post_queue(id) ON DELETE SET NULL,
  use_count integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_topics_location
  ON gbp_post_topics(location_id);

CREATE INDEX IF NOT EXISTS idx_post_topics_available
  ON gbp_post_topics(location_id, used_at)
  WHERE active = true AND used_at IS NULL;

-- RLS
ALTER TABLE gbp_post_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view topics for their locations" ON gbp_post_topics;
CREATE POLICY "Users can view topics for their locations"
  ON gbp_post_topics FOR SELECT
  TO authenticated
  USING (location_id IN (SELECT get_user_location_ids()));

DROP POLICY IF EXISTS "Agency admins can manage topics" ON gbp_post_topics;
CREATE POLICY "Agency admins can manage topics"
  ON gbp_post_topics FOR ALL
  TO authenticated
  USING (is_agency_admin())
  WITH CHECK (is_agency_admin());

-- 2. Brand config table (org-level) ------------------------------------

CREATE TABLE IF NOT EXISTS brand_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  brand_voice text,
  design_style text,
  primary_color text,
  secondary_color text,
  font_style text,
  sample_image_urls text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(org_id)
);

CREATE TRIGGER brand_config_updated_at
  BEFORE UPDATE ON brand_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE brand_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their org brand config" ON brand_config;
CREATE POLICY "Users can view their org brand config"
  ON brand_config FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

DROP POLICY IF EXISTS "Agency admins can manage brand config" ON brand_config;
CREATE POLICY "Agency admins can manage brand config"
  ON brand_config FOR ALL
  TO authenticated
  USING (is_agency_admin())
  WITH CHECK (is_agency_admin());

-- 3. Brand override columns on locations --------------------------------

ALTER TABLE locations ADD COLUMN IF NOT EXISTS brand_voice text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS design_style text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS primary_color text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS secondary_color text;

-- 4. Posts per month on locations ----------------------------------------

ALTER TABLE locations ADD COLUMN IF NOT EXISTS posts_per_month integer
  NOT NULL DEFAULT 0;

-- 5. Extend gbp_post_queue status for two-stage approval ----------------
--    Add 'draft', 'client_review', 'rejected' to allowed values.

ALTER TABLE gbp_post_queue DROP CONSTRAINT IF EXISTS gbp_post_queue_status_check;
ALTER TABLE gbp_post_queue ADD CONSTRAINT gbp_post_queue_status_check
  CHECK (status IN ('draft', 'client_review', 'pending', 'sending', 'confirmed', 'failed', 'rejected'));

-- 6. Add topic_id FK on gbp_post_queue ----------------------------------

ALTER TABLE gbp_post_queue ADD COLUMN IF NOT EXISTS topic_id uuid
  REFERENCES gbp_post_topics(id) ON DELETE SET NULL;

-- 7. Add source column to gbp_post_queue --------------------------------
--    Tracks whether a post was manually created or AI-generated.

ALTER TABLE gbp_post_queue ADD COLUMN IF NOT EXISTS source text
  NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'ai'));

-- 8. Index for draft posts (work queue queries) -------------------------

CREATE INDEX IF NOT EXISTS idx_post_queue_draft
  ON gbp_post_queue(status, location_id)
  WHERE status IN ('draft', 'client_review');
