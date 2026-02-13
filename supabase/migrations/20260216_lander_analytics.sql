-- Lander analytics: track page views and CTA clicks per lander/location

CREATE TABLE lander_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lander_id uuid NOT NULL REFERENCES local_landers(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('page_view', 'phone_click', 'directions_click', 'website_click')),
  metadata jsonb NOT NULL DEFAULT '{}',
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lander_events_lander ON lander_events(lander_id);
CREATE INDEX idx_lander_events_location ON lander_events(location_id);
CREATE INDEX idx_lander_events_created ON lander_events(created_at DESC);
CREATE INDEX idx_lander_events_type ON lander_events(lander_id, event_type);

-- RLS: public inserts via admin client, reads for org members
ALTER TABLE lander_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lander_events_select" ON lander_events;
CREATE POLICY "lander_events_select" ON lander_events FOR SELECT USING (
  location_id IN (SELECT get_user_location_ids())
);

-- Aggregated stats view for admin dashboards
CREATE OR REPLACE VIEW lander_stats AS
SELECT
  ll.id AS lander_id,
  ll.slug,
  ll.location_id,
  ll.heading,
  COUNT(*) FILTER (WHERE le.event_type = 'page_view') AS total_views,
  COUNT(*) FILTER (WHERE le.event_type = 'phone_click') AS total_phone_clicks,
  COUNT(*) FILTER (WHERE le.event_type = 'directions_click') AS total_directions_clicks,
  COUNT(*) FILTER (WHERE le.event_type = 'website_click') AS total_website_clicks,
  COUNT(*) FILTER (WHERE le.event_type = 'page_view' AND le.created_at > now() - interval '7 days') AS views_7d,
  COUNT(*) FILTER (WHERE le.event_type = 'phone_click' AND le.created_at > now() - interval '7 days') AS phone_clicks_7d,
  COUNT(*) FILTER (WHERE le.event_type = 'directions_click' AND le.created_at > now() - interval '7 days') AS directions_clicks_7d,
  COUNT(*) FILTER (WHERE le.event_type = 'website_click' AND le.created_at > now() - interval '7 days') AS website_clicks_7d,
  COUNT(*) FILTER (WHERE le.event_type = 'page_view' AND le.created_at > now() - interval '30 days') AS views_30d
FROM local_landers ll
LEFT JOIN lander_events le ON le.lander_id = ll.id
GROUP BY ll.id, ll.slug, ll.location_id, ll.heading;

-- Add ai_content_stale flag to local_landers for auto-regeneration triggers
ALTER TABLE local_landers ADD COLUMN IF NOT EXISTS ai_content_stale boolean NOT NULL DEFAULT false;
