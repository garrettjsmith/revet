-- ============================================================
-- Migration: Notification preferences per user per location
-- Allows users to control which alert types they receive
-- for each location. Agency sets defaults, users toggle.
-- Idempotent — safe to run multiple times.
-- ============================================================

-- 1. Notification preferences table ------------------------------

CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  alert_type text NOT NULL
    CHECK (alert_type IN (
      'new_review',         -- any new review arrives
      'negative_review',    -- rating <= threshold
      'review_response',    -- a reply is posted to a review
      'report'              -- periodic report available
    )),
  email_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, location_id, alert_type)
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_org ON notification_preferences(org_id);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_location ON notification_preferences(location_id);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_lookup
  ON notification_preferences(location_id, alert_type) WHERE email_enabled = true;

CREATE TRIGGER notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2. RLS ----------------------------------------------------------

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can view their own preferences
DROP POLICY IF EXISTS "Users can view own notification preferences" ON notification_preferences;
CREATE POLICY "Users can view own notification preferences"
  ON notification_preferences FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can update their own preferences (toggle on/off)
DROP POLICY IF EXISTS "Users can update own notification preferences" ON notification_preferences;
CREATE POLICY "Users can update own notification preferences"
  ON notification_preferences FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Agency admins can view all preferences in their orgs
DROP POLICY IF EXISTS "Agency admins can view all notification preferences" ON notification_preferences;
CREATE POLICY "Agency admins can view all notification preferences"
  ON notification_preferences FOR SELECT
  TO authenticated
  USING (is_agency_admin());

-- Agency admins can manage (insert/update/delete) all preferences
DROP POLICY IF EXISTS "Agency admins can manage notification preferences" ON notification_preferences;
CREATE POLICY "Agency admins can manage notification preferences"
  ON notification_preferences FOR ALL
  TO authenticated
  USING (is_agency_admin())
  WITH CHECK (is_agency_admin());

-- 3. SECURITY DEFINER: Initialize defaults for a user -----------

CREATE OR REPLACE FUNCTION initialize_notification_preferences(
  p_org_id uuid,
  p_user_id uuid,
  p_location_ids uuid[],
  p_email_enabled boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_location_id uuid;
  v_alert_types text[] := ARRAY['new_review', 'negative_review', 'review_response', 'report'];
  v_alert_type text;
BEGIN
  FOREACH v_location_id IN ARRAY p_location_ids
  LOOP
    FOREACH v_alert_type IN ARRAY v_alert_types
    LOOP
      INSERT INTO notification_preferences (org_id, user_id, location_id, alert_type, email_enabled)
      VALUES (p_org_id, p_user_id, v_location_id, v_alert_type, p_email_enabled)
      ON CONFLICT (user_id, location_id, alert_type) DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;

-- 4. Helper: get emails to notify for a given location + alert type

CREATE OR REPLACE FUNCTION get_notification_emails(
  p_location_id uuid,
  p_alert_type text
)
RETURNS TABLE(email text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT u.email
  FROM notification_preferences np
  JOIN auth.users u ON u.id = np.user_id
  WHERE np.location_id = p_location_id
    AND np.alert_type = p_alert_type
    AND np.email_enabled = true;
$$;
