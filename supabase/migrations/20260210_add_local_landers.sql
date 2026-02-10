-- ============================================================
-- Migration: Local landers
-- Revet-hosted location landing pages with auto-generated schema.
-- Idempotent — safe to run multiple times.
-- ============================================================

-- 1. Local landers table (1:1 with locations) ------------------

CREATE TABLE IF NOT EXISTS local_landers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,

  -- Display config
  heading text,                    -- Override heading (default: location name)
  description text,                -- Override description (default: GBP description)
  primary_color text DEFAULT '#1B4965',
  logo_url text,

  -- Content overrides (null = auto-generate from GBP/location data)
  custom_about text,
  custom_services jsonb,           -- [{name, description}]
  custom_faq jsonb,                -- [{question, answer}]
  custom_hours jsonb,              -- Override GBP hours

  -- AI-generated content (cached, Phase 2)
  ai_content jsonb,                -- {local_context, service_descriptions, faq, review_highlights}
  ai_content_generated_at timestamptz,

  -- Settings
  show_reviews boolean DEFAULT true,
  show_map boolean DEFAULT true,
  show_faq boolean DEFAULT true,
  active boolean DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(location_id)
);

CREATE INDEX IF NOT EXISTS idx_local_landers_slug ON local_landers(slug);
CREATE INDEX IF NOT EXISTS idx_local_landers_location ON local_landers(location_id);
CREATE INDEX IF NOT EXISTS idx_local_landers_org ON local_landers(org_id);

CREATE TRIGGER local_landers_updated_at
  BEFORE UPDATE ON local_landers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2. RLS policies -----------------------------------------------

ALTER TABLE local_landers ENABLE ROW LEVEL SECURITY;

-- Org members can view their landers
DROP POLICY IF EXISTS "Users can view org landers" ON local_landers;
CREATE POLICY "Users can view org landers"
  ON local_landers FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

-- Agency admins can manage landers
DROP POLICY IF EXISTS "Agency admins can manage landers" ON local_landers;
CREATE POLICY "Agency admins can manage landers"
  ON local_landers FOR ALL
  TO authenticated
  USING (is_agency_admin())
  WITH CHECK (is_agency_admin());

-- Anon users can view active landers (public pages)
DROP POLICY IF EXISTS "Public can view active landers" ON local_landers;
CREATE POLICY "Public can view active landers"
  ON local_landers FOR SELECT
  TO anon
  USING (active = true);
