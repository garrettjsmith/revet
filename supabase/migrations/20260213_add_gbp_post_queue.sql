-- ============================================================
-- Migration: GBP post scheduling queue
--
-- Enables scheduled posting to Google Business Profile.
-- Mirrors the review_reply_queue pattern for consistency.
-- ============================================================

CREATE TABLE IF NOT EXISTS gbp_post_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  topic_type text NOT NULL DEFAULT 'STANDARD'
    CHECK (topic_type IN ('STANDARD', 'EVENT', 'OFFER', 'ALERT')),
  summary text NOT NULL,
  action_type text,
  action_url text,
  media_url text,
  event_title text,
  event_start timestamptz,
  event_end timestamptz,
  offer_coupon_code text,
  offer_terms text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'confirmed', 'failed')),
  scheduled_for timestamptz,
  queued_by uuid NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  gbp_post_name text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_queue_status
  ON gbp_post_queue(status, scheduled_for)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_post_queue_location
  ON gbp_post_queue(location_id);

CREATE TRIGGER gbp_post_queue_updated_at
  BEFORE UPDATE ON gbp_post_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE gbp_post_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view post queue for their locations" ON gbp_post_queue;
CREATE POLICY "Users can view post queue for their locations"
  ON gbp_post_queue FOR SELECT
  TO authenticated
  USING (location_id IN (SELECT get_user_location_ids()));

DROP POLICY IF EXISTS "Agency admins can manage post queue" ON gbp_post_queue;
CREATE POLICY "Agency admins can manage post queue"
  ON gbp_post_queue FOR ALL
  TO authenticated
  USING (is_agency_admin())
  WITH CHECK (is_agency_admin());
