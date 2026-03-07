-- Add per-location toggles for individual profile update skills.
-- JSONB with keys: description, categories, attributes, hours, media, services, website
-- Each value is a boolean. Default: all enabled.
ALTER TABLE location_agent_config
  ADD COLUMN IF NOT EXISTS profile_skills jsonb NOT NULL DEFAULT '{"description":true,"categories":true,"attributes":true,"hours":true,"media":true,"services":true,"website":true}'::jsonb;
