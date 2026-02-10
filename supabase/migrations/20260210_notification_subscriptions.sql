-- ============================================================
-- Migration: Replace notification_preferences with notification_subscriptions
--
-- Old model: per-user × per-location × per-alert-type toggles
--   → Sturdy (28 users × 155 locs × 4 types) = 17,360 rows
--
-- New model: agency-managed subscriptions with org-wide defaults
--   → "Subscribe all org members to new_review" = 1 row
--
-- subscriber_type:
--   'all_members' → all org_members get notified (subscriber_value ignored)
--   'user'        → specific user_id in subscriber_value
--   'email'       → external email in subscriber_value
-- ============================================================

-- 1. Notification subscriptions table ----------------------------

CREATE TABLE IF NOT EXISTS notification_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id uuid REFERENCES locations(id) ON DELETE CASCADE,  -- null = all locations in org
  alert_type text NOT NULL
    CHECK (alert_type IN ('new_review', 'negative_review', 'review_response', 'report')),
  subscriber_type text NOT NULL
    CHECK (subscriber_type IN ('all_members', 'user', 'email')),
  subscriber_value text,  -- user_id (for 'user'), email (for 'email'), null (for 'all_members')
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, location_id, alert_type, subscriber_type, subscriber_value)
);

-- Handle null location_id in unique constraint (null != null in SQL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_subs_org_wide
  ON notification_subscriptions(org_id, alert_type, subscriber_type, subscriber_value)
  WHERE location_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_notification_subs_org ON notification_subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_notification_subs_location ON notification_subscriptions(location_id);
CREATE INDEX IF NOT EXISTS idx_notification_subs_lookup
  ON notification_subscriptions(org_id, alert_type) WHERE location_id IS NULL;

CREATE TRIGGER notification_subscriptions_updated_at
  BEFORE UPDATE ON notification_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2. RLS ----------------------------------------------------------

ALTER TABLE notification_subscriptions ENABLE ROW LEVEL SECURITY;

-- Org members can view subscriptions for their orgs
DROP POLICY IF EXISTS "Users can view notification subscriptions for their orgs" ON notification_subscriptions;
CREATE POLICY "Users can view notification subscriptions for their orgs"
  ON notification_subscriptions FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

-- Agency admins can manage all subscriptions
DROP POLICY IF EXISTS "Agency admins can manage notification subscriptions" ON notification_subscriptions;
CREATE POLICY "Agency admins can manage notification subscriptions"
  ON notification_subscriptions FOR ALL
  TO authenticated
  USING (is_agency_admin())
  WITH CHECK (is_agency_admin());

-- 3. SECURITY DEFINER: Resolve emails for a location + alert type --

CREATE OR REPLACE FUNCTION get_subscription_emails(
  p_org_id uuid,
  p_location_id uuid,
  p_alert_type text
)
RETURNS TABLE(email text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  -- Direct email subscribers (org-wide or location-specific)
  SELECT ns.subscriber_value AS email
  FROM notification_subscriptions ns
  WHERE ns.org_id = p_org_id
    AND ns.alert_type = p_alert_type
    AND ns.subscriber_type = 'email'
    AND (ns.location_id IS NULL OR ns.location_id = p_location_id)

  UNION

  -- Specific user subscribers (org-wide or location-specific)
  SELECT u.email
  FROM notification_subscriptions ns
  JOIN auth.users u ON u.id = ns.subscriber_value::uuid
  WHERE ns.org_id = p_org_id
    AND ns.alert_type = p_alert_type
    AND ns.subscriber_type = 'user'
    AND (ns.location_id IS NULL OR ns.location_id = p_location_id)

  UNION

  -- All members subscriptions (org-wide or location-specific)
  SELECT u.email
  FROM notification_subscriptions ns
  JOIN org_members om ON om.org_id = ns.org_id
  JOIN auth.users u ON u.id = om.user_id
  WHERE ns.org_id = p_org_id
    AND ns.alert_type = p_alert_type
    AND ns.subscriber_type = 'all_members'
    AND (ns.location_id IS NULL OR ns.location_id = p_location_id)
    -- Respect location access: only members with access to this location
    AND (
      om.location_access = 'all'
      OR EXISTS (
        SELECT 1 FROM org_member_locations oml
        WHERE oml.org_member_id = om.id AND oml.location_id = p_location_id
      )
    );
$$;

-- 4. Drop old notification_preferences system --------------------

-- Drop old helper function
DROP FUNCTION IF EXISTS get_notification_emails(uuid, text);
DROP FUNCTION IF EXISTS initialize_notification_preferences(uuid, uuid, uuid[], boolean);

-- Drop old table (cascade drops policies, triggers, indexes)
DROP TABLE IF EXISTS notification_preferences CASCADE;
