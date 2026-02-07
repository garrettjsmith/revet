-- ============================================================
-- Migration: Add encrypted token storage to agency_integrations
-- and GBP performance metrics table.
-- Idempotent — safe to run multiple times.
-- ============================================================

-- 1. Token columns on agency_integrations -----------------------

ALTER TABLE agency_integrations
  ADD COLUMN IF NOT EXISTS access_token_encrypted text,
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS scopes text[] DEFAULT '{}';

-- 2. GBP performance metrics (long/narrow format) ---------------

CREATE TABLE IF NOT EXISTS gbp_performance_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  date date NOT NULL,
  metric text NOT NULL,    -- 'search_impressions', 'map_impressions', 'website_clicks', 'direction_requests', 'call_clicks', 'bookings'
  value bigint NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(location_id, date, metric)
);

CREATE INDEX IF NOT EXISTS idx_gbp_perf_location_date ON gbp_performance_metrics(location_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_gbp_perf_metric ON gbp_performance_metrics(location_id, metric, date DESC);

-- RLS: performance metrics visible to org members with location access
ALTER TABLE gbp_performance_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view performance metrics" ON gbp_performance_metrics;
CREATE POLICY "Users can view performance metrics"
  ON gbp_performance_metrics FOR SELECT
  TO authenticated
  USING (location_id IN (SELECT get_user_location_ids()));

DROP POLICY IF EXISTS "Agency admins can manage performance metrics" ON gbp_performance_metrics;
CREATE POLICY "Agency admins can manage performance metrics"
  ON gbp_performance_metrics FOR ALL
  TO authenticated
  USING (is_agency_admin())
  WITH CHECK (is_agency_admin());

-- 3. Review reply queue -------------------------------------------

CREATE TABLE IF NOT EXISTS review_reply_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  reply_body text NOT NULL,
  queued_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'confirmed', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reply_queue_status ON review_reply_queue(status) WHERE status IN ('pending', 'sending');
CREATE INDEX IF NOT EXISTS idx_reply_queue_review ON review_reply_queue(review_id);

ALTER TABLE review_reply_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage reply queue" ON review_reply_queue;
CREATE POLICY "Users can manage reply queue"
  ON review_reply_queue FOR ALL
  TO authenticated
  USING (
    review_id IN (
      SELECT r.id FROM reviews r
      WHERE r.location_id IN (SELECT get_user_location_ids())
    )
  )
  WITH CHECK (
    review_id IN (
      SELECT r.id FROM reviews r
      WHERE r.location_id IN (SELECT get_user_location_ids())
    )
  );
