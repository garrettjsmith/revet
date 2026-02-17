-- ============================================================
-- Migration: AI review replies and autopilot
--
-- 1. review_autopilot_config — per-location autopilot settings
-- 2. reviews.ai_draft — AI-generated reply draft
-- 3. review_reply_queue.scheduled_for — delayed posting support
-- ============================================================

-- 1. Autopilot config table -----------------------------------------

CREATE TABLE IF NOT EXISTS review_autopilot_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  auto_reply_ratings smallint[] NOT NULL DEFAULT '{4,5}',
  tone text NOT NULL DEFAULT 'professional and friendly',
  business_context text,
  delay_min_minutes integer NOT NULL DEFAULT 30,
  delay_max_minutes integer NOT NULL DEFAULT 180,
  require_approval boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autopilot_config_location
  ON review_autopilot_config(location_id);

CREATE TRIGGER review_autopilot_config_updated_at
  BEFORE UPDATE ON review_autopilot_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE review_autopilot_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency admins manage autopilot config" ON review_autopilot_config;
CREATE POLICY "Agency admins manage autopilot config"
  ON review_autopilot_config FOR ALL
  TO authenticated
  USING (is_agency_admin())
  WITH CHECK (is_agency_admin());

DROP POLICY IF EXISTS "Users can view autopilot config for their locations" ON review_autopilot_config;
CREATE POLICY "Users can view autopilot config for their locations"
  ON review_autopilot_config FOR SELECT
  TO authenticated
  USING (location_id IN (SELECT get_user_location_ids()));

-- 2. AI draft columns on reviews ------------------------------------

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS ai_draft text,
  ADD COLUMN IF NOT EXISTS ai_draft_generated_at timestamptz;

-- 3. Reply queue scheduling columns ---------------------------------

ALTER TABLE review_reply_queue
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;

-- Add check constraint for source (can't use IF NOT EXISTS, so guard with DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'review_reply_queue_source_check'
  ) THEN
    ALTER TABLE review_reply_queue
      ADD CONSTRAINT review_reply_queue_source_check
      CHECK (source IN ('manual', 'ai_autopilot'));
  END IF;
END $$;

-- Index for scheduled queue processing
CREATE INDEX IF NOT EXISTS idx_reply_queue_scheduled
  ON review_reply_queue(status, scheduled_for)
  WHERE status = 'pending';
