-- ============================================================
-- Migration: Review monitoring infrastructure
-- Platform-agnostic review storage with Google as first source.
-- Idempotent — safe to run multiple times.
-- ============================================================

-- 1. Review sources: links a location to a platform listing ----

CREATE TABLE IF NOT EXISTS review_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  platform text NOT NULL,                -- 'google', 'healthgrades', 'yelp', 'facebook', 'vitals', 'zocdoc'
  platform_listing_id text NOT NULL,     -- place_id for Google, URL/ID for others
  platform_listing_name text,            -- human-readable listing name
  sync_status text NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'active', 'paused', 'error')),
  last_synced_at timestamptz,
  sync_cursor text,                      -- platform-specific pagination token
  total_review_count integer DEFAULT 0,
  average_rating numeric(3,2),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(location_id, platform, platform_listing_id)
);

CREATE INDEX IF NOT EXISTS idx_review_sources_location ON review_sources(location_id);
CREATE INDEX IF NOT EXISTS idx_review_sources_platform ON review_sources(platform);

CREATE TRIGGER review_sources_updated_at
  BEFORE UPDATE ON review_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2. Reviews: the universal review record -----------------------

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES review_sources(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  platform text NOT NULL,
  platform_review_id text NOT NULL,

  -- Universal fields
  reviewer_name text,
  reviewer_photo_url text,
  is_anonymous boolean DEFAULT false,
  rating smallint,                       -- normalized 1-5 (null for thumbs-only platforms)
  original_rating text,                  -- raw rating as string ('4/5', 'FIVE', etc.)
  body text,                             -- review text
  language text DEFAULT 'en',
  published_at timestamptz NOT NULL,
  updated_at timestamptz,

  -- Reply tracking
  reply_body text,
  reply_published_at timestamptz,
  replied_by uuid,
  replied_via text,                      -- 'api', 'manual', 'ai_draft'

  -- Internal workflow
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'seen', 'flagged', 'responded', 'archived')),
  sentiment text
    CHECK (sentiment IS NULL OR sentiment IN ('positive', 'neutral', 'negative')),
  internal_notes text,
  assigned_to uuid,

  -- Platform-specific metadata
  platform_metadata jsonb DEFAULT '{}',

  -- Sync tracking
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(source_id, platform_review_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_location ON reviews(location_id);
CREATE INDEX IF NOT EXISTS idx_reviews_source ON reviews(source_id);
CREATE INDEX IF NOT EXISTS idx_reviews_platform ON reviews(platform);
CREATE INDEX IF NOT EXISTS idx_reviews_published ON reviews(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(location_id, rating);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(location_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_location_published ON reviews(location_id, platform, published_at DESC);

-- 3. Review alert rules: configurable notifications -------------

CREATE TABLE IF NOT EXISTS review_alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id uuid REFERENCES locations(id) ON DELETE CASCADE,  -- null = org-wide rule
  name text NOT NULL,
  rule_type text NOT NULL
    CHECK (rule_type IN (
      'new_review',           -- any new review
      'negative_review',      -- rating <= threshold
      'no_reply',             -- not replied within X hours
      'keyword_match'         -- specific words in review text
    )),
  config jsonb NOT NULL DEFAULT '{}',    -- threshold, keywords, hours, etc.
  notify_emails text[] NOT NULL DEFAULT '{}',
  notify_in_app boolean DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_alert_rules_org ON review_alert_rules(org_id);
CREATE INDEX IF NOT EXISTS idx_review_alert_rules_location ON review_alert_rules(location_id);

CREATE TRIGGER review_alert_rules_updated_at
  BEFORE UPDATE ON review_alert_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4. Review alerts sent log ------------------------------------

CREATE TABLE IF NOT EXISTS review_alerts_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES review_alert_rules(id) ON DELETE CASCADE,
  review_id uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  channels text[] NOT NULL DEFAULT '{}',
  sent_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_review_alerts_sent_rule ON review_alerts_sent(rule_id);
CREATE INDEX IF NOT EXISTS idx_review_alerts_sent_review ON review_alerts_sent(review_id);

-- 5. RLS policies -----------------------------------------------

ALTER TABLE review_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_alerts_sent ENABLE ROW LEVEL SECURITY;

-- Review sources: visible if user has access to the location
DROP POLICY IF EXISTS "Users can view review sources for their locations" ON review_sources;
CREATE POLICY "Users can view review sources for their locations"
  ON review_sources FOR SELECT
  TO authenticated
  USING (location_id IN (SELECT get_user_location_ids()));

DROP POLICY IF EXISTS "Agency admins can manage review sources" ON review_sources;
CREATE POLICY "Agency admins can manage review sources"
  ON review_sources FOR ALL
  TO authenticated
  USING (is_agency_admin())
  WITH CHECK (is_agency_admin());

-- Reviews: visible if user has access to the location
DROP POLICY IF EXISTS "Users can view reviews for their locations" ON reviews;
CREATE POLICY "Users can view reviews for their locations"
  ON reviews FOR SELECT
  TO authenticated
  USING (location_id IN (SELECT get_user_location_ids()));

DROP POLICY IF EXISTS "Users can update reviews for their locations" ON reviews;
CREATE POLICY "Users can update reviews for their locations"
  ON reviews FOR UPDATE
  TO authenticated
  USING (location_id IN (SELECT get_user_location_ids()));

-- Alert rules: visible to org members
DROP POLICY IF EXISTS "Users can view alert rules for their orgs" ON review_alert_rules;
CREATE POLICY "Users can view alert rules for their orgs"
  ON review_alert_rules FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

DROP POLICY IF EXISTS "Admins can manage alert rules" ON review_alert_rules;
CREATE POLICY "Admins can manage alert rules"
  ON review_alert_rules FOR ALL
  TO authenticated
  USING (org_id IN (SELECT get_user_admin_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_admin_org_ids()));

-- Alert sent log: visible to org members via rule
DROP POLICY IF EXISTS "Users can view sent alerts" ON review_alerts_sent;
CREATE POLICY "Users can view sent alerts"
  ON review_alerts_sent FOR SELECT
  TO authenticated
  USING (
    rule_id IN (
      SELECT id FROM review_alert_rules
      WHERE org_id IN (SELECT get_user_org_ids())
    )
  );

-- 6. Summary view for quick stats per source ---------------------

DROP VIEW IF EXISTS review_source_stats;
CREATE VIEW review_source_stats AS
SELECT
  rs.id AS source_id,
  rs.location_id,
  rs.platform,
  rs.platform_listing_name,
  rs.sync_status,
  rs.last_synced_at,
  COUNT(r.id) AS total_reviews,
  ROUND(AVG(r.rating)::numeric, 2) AS avg_rating,
  COUNT(r.id) FILTER (WHERE r.published_at >= now() - interval '7 days') AS reviews_7d,
  COUNT(r.id) FILTER (WHERE r.published_at >= now() - interval '30 days') AS reviews_30d,
  COUNT(r.id) FILTER (WHERE r.rating <= 2) AS negative_count,
  COUNT(r.id) FILTER (WHERE r.reply_body IS NOT NULL) AS replied_count,
  COUNT(r.id) FILTER (WHERE r.status = 'new') AS unread_count
FROM review_sources rs
LEFT JOIN reviews r ON r.source_id = rs.id
GROUP BY rs.id;
