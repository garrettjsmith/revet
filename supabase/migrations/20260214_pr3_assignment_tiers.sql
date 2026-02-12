-- PR 3: Assignment + Service Tiers
--
-- 1. Add service_tier to locations (controls which work types get generated)
-- 2. Add assigned_to to gbp_post_queue (for assignment tracking)

-- Service tier on locations
ALTER TABLE locations ADD COLUMN IF NOT EXISTS service_tier TEXT
  DEFAULT 'standard' CHECK (service_tier IN ('starter', 'standard', 'premium'));

-- Assignment on post queue items
ALTER TABLE gbp_post_queue ADD COLUMN IF NOT EXISTS assigned_to UUID
  REFERENCES auth.users(id) ON DELETE SET NULL;
