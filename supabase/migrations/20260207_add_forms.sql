-- ============================================================
-- Migration: Forms — form_templates + form_submissions
-- Idempotent — safe to run multiple times.
-- ============================================================

-- 1. Form templates --------------------------------------------------

CREATE TABLE IF NOT EXISTS form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id uuid REFERENCES locations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,

  -- Form field definitions (JSON array)
  -- Each field: { id, type, label, placeholder, required, options? }
  -- Types: text, email, phone, textarea, select, checkbox
  fields jsonb NOT NULL DEFAULT '[]',

  -- Alert settings
  alert_email text,             -- who gets notified on submission
  alert_enabled boolean NOT NULL DEFAULT true,

  -- Branding (inherits from review profile pattern)
  heading text NOT NULL DEFAULT 'Contact Us',
  subtext text NOT NULL DEFAULT 'Fill out the form below and we will get back to you shortly.',
  primary_color text NOT NULL DEFAULT '#1B4965',
  logo_url text,
  logo_text text,
  logo_subtext text,

  -- Confirmation
  confirmation_heading text NOT NULL DEFAULT 'Thank you!',
  confirmation_message text NOT NULL DEFAULT 'We have received your submission and will be in touch soon.',

  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_templates_org ON form_templates(org_id);
CREATE INDEX IF NOT EXISTS idx_form_templates_location ON form_templates(location_id);
CREATE INDEX IF NOT EXISTS idx_form_templates_slug ON form_templates(slug) WHERE active = true;

CREATE TRIGGER form_templates_updated_at
  BEFORE UPDATE ON form_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2. Form submissions ------------------------------------------------

CREATE TABLE IF NOT EXISTS form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}',   -- { field_id: value, ... }
  metadata jsonb DEFAULT '{}',        -- user agent, referrer, IP (hashed), etc.
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_form ON form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_created ON form_submissions(created_at DESC);

-- 3. RLS policies ----------------------------------------------------

ALTER TABLE form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;

-- Form templates: authenticated users can manage their org's forms
DROP POLICY IF EXISTS "Users can view forms in their orgs" ON form_templates;
CREATE POLICY "Users can view forms in their orgs"
  ON form_templates FOR SELECT
  TO authenticated
  USING (
    org_id IN (SELECT get_user_org_ids())
    AND (
      location_id IS NULL
      OR location_id IN (SELECT get_user_location_ids())
    )
  );

DROP POLICY IF EXISTS "Admins can insert forms" ON form_templates;
CREATE POLICY "Admins can insert forms"
  ON form_templates FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT get_user_admin_org_ids()));

DROP POLICY IF EXISTS "Admins can update forms" ON form_templates;
CREATE POLICY "Admins can update forms"
  ON form_templates FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT get_user_admin_org_ids()));

DROP POLICY IF EXISTS "Admins can delete forms" ON form_templates;
CREATE POLICY "Admins can delete forms"
  ON form_templates FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT get_user_admin_org_ids()));

-- Public can read active forms (for /f/[slug] pages)
DROP POLICY IF EXISTS "Public can read active forms" ON form_templates;
CREATE POLICY "Public can read active forms"
  ON form_templates FOR SELECT
  TO anon
  USING (active = true);

-- Submissions: public can insert (form submission), authenticated can view
DROP POLICY IF EXISTS "Public can submit forms" ON form_submissions;
CREATE POLICY "Public can submit forms"
  ON form_submissions FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view submissions in their orgs" ON form_submissions;
CREATE POLICY "Users can view submissions in their orgs"
  ON form_submissions FOR SELECT
  TO authenticated
  USING (form_id IN (
    SELECT id FROM form_templates WHERE org_id IN (SELECT get_user_org_ids())
  ));
