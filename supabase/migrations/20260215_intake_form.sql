-- Intake form support

-- 1. Add intake data to locations
ALTER TABLE locations ADD COLUMN IF NOT EXISTS intake_data jsonb DEFAULT '{}';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS intake_completed_at timestamptz;

-- 2. Add structured voice/style selections + logo to brand_config
ALTER TABLE brand_config ADD COLUMN IF NOT EXISTS voice_selections jsonb DEFAULT '{}';
ALTER TABLE brand_config ADD COLUMN IF NOT EXISTS style_selections jsonb DEFAULT '{}';
ALTER TABLE brand_config ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE brand_config ADD COLUMN IF NOT EXISTS post_approval_mode text DEFAULT 'approve_first'
  CHECK (post_approval_mode IN ('approve_first', 'auto_post'));
