-- Profile optimization pipeline: recommendations, corrections, audit history

-- 1. Profile recommendations — batched proposed changes per location
CREATE TABLE IF NOT EXISTS profile_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL,
  field text NOT NULL CHECK (field IN ('description', 'categories', 'attributes', 'hours')),
  current_value jsonb,
  proposed_value jsonb NOT NULL,
  ai_rationale text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'client_review', 'applied', 'rejected')),
  requires_client_approval boolean NOT NULL DEFAULT false,
  edited_value jsonb,
  approved_by uuid,
  approved_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_recommendations_location ON profile_recommendations(location_id);
CREATE INDEX IF NOT EXISTS idx_profile_recommendations_batch ON profile_recommendations(batch_id);
CREATE INDEX IF NOT EXISTS idx_profile_recommendations_status ON profile_recommendations(status);

-- RLS
ALTER TABLE profile_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency members can view recommendations" ON profile_recommendations;
CREATE POLICY "Agency members can view recommendations" ON profile_recommendations
  FOR SELECT USING (
    location_id IN (SELECT get_user_location_ids())
  );

-- 2. AI corrections — stores AM edits for learning
CREATE TABLE IF NOT EXISTS ai_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  field text NOT NULL,
  original_text text NOT NULL,
  corrected_text text NOT NULL,
  context jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_corrections_org ON ai_corrections(org_id);
CREATE INDEX IF NOT EXISTS idx_ai_corrections_location ON ai_corrections(location_id);

ALTER TABLE ai_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency admins can manage corrections" ON ai_corrections;
CREATE POLICY "Agency admins can manage corrections" ON ai_corrections
  FOR ALL USING (
    org_id IN (SELECT get_user_admin_org_ids())
  );

-- 3. Audit history — track scores over time
CREATE TABLE IF NOT EXISTS audit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  score integer NOT NULL,
  sections jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_history_location ON audit_history(location_id);
CREATE INDEX IF NOT EXISTS idx_audit_history_created ON audit_history(location_id, created_at DESC);

ALTER TABLE audit_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency members can view audit history" ON audit_history;
CREATE POLICY "Agency members can view audit history" ON audit_history
  FOR SELECT USING (
    location_id IN (SELECT get_user_location_ids())
  );

-- 4. Add setup_status to locations
ALTER TABLE locations ADD COLUMN IF NOT EXISTS setup_status text DEFAULT 'pending'
  CHECK (setup_status IN ('pending', 'audited', 'optimizing', 'optimized'));
