-- Location Setup Pipeline
-- Tracks each location's progress through the onboarding pipeline.
-- Each phase is an independent row so phases can run in parallel.

CREATE TABLE location_setup_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN (
    'gbp_connect',
    'initial_sync',
    'benchmark',
    'audit',
    'intake',
    'recommendations',
    'optimization',
    'review_setup',
    'citations',
    'lander',
    'notifications',
    'complete'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'running',
    'completed',
    'failed',
    'skipped'
  )),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(location_id, phase)
);

-- Index for pipeline queries: "show me all locations with pending phases"
CREATE INDEX idx_setup_phases_status ON location_setup_phases(status)
  WHERE status IN ('pending', 'running', 'failed');

-- Index for location lookups
CREATE INDEX idx_setup_phases_location ON location_setup_phases(location_id);

-- RLS: agency admins can see all, org members can see their locations
ALTER TABLE location_setup_phases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "setup_phases_select" ON location_setup_phases;
CREATE POLICY "setup_phases_select" ON location_setup_phases
  FOR SELECT USING (
    location_id IN (SELECT get_user_location_ids())
  );

DROP POLICY IF EXISTS "setup_phases_insert" ON location_setup_phases;
CREATE POLICY "setup_phases_insert" ON location_setup_phases
  FOR INSERT WITH CHECK (
    location_id IN (SELECT get_user_location_ids())
  );

DROP POLICY IF EXISTS "setup_phases_update" ON location_setup_phases;
CREATE POLICY "setup_phases_update" ON location_setup_phases
  FOR UPDATE USING (
    location_id IN (SELECT get_user_location_ids())
  );

-- Function to initialize pipeline phases for a new location
CREATE OR REPLACE FUNCTION initialize_setup_phases(p_location_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO location_setup_phases (location_id, phase, status)
  VALUES
    (p_location_id, 'gbp_connect', 'pending'),
    (p_location_id, 'initial_sync', 'pending'),
    (p_location_id, 'benchmark', 'pending'),
    (p_location_id, 'audit', 'pending'),
    (p_location_id, 'intake', 'pending'),
    (p_location_id, 'recommendations', 'pending'),
    (p_location_id, 'optimization', 'pending'),
    (p_location_id, 'review_setup', 'pending'),
    (p_location_id, 'citations', 'pending'),
    (p_location_id, 'lander', 'pending'),
    (p_location_id, 'notifications', 'pending'),
    (p_location_id, 'complete', 'pending')
  ON CONFLICT DO NOTHING;
END;
$$;

-- Trigger to auto-initialize phases when a location is created
CREATE OR REPLACE FUNCTION trigger_initialize_setup_phases()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM initialize_setup_phases(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_location_setup_phases ON locations;
CREATE TRIGGER trg_location_setup_phases
  AFTER INSERT ON locations
  FOR EACH ROW
  EXECUTE FUNCTION trigger_initialize_setup_phases();
