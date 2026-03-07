-- Add per-location trust levels for individual profile update skills.
-- JSONB with keys: description, categories, attributes, hours, media, services, website
-- Each value is 'auto', 'queue', or 'off'. Default: all 'queue'.
-- Replaces the single profile_updates column for granular control.
ALTER TABLE location_agent_config
  ADD COLUMN IF NOT EXISTS profile_skills jsonb NOT NULL DEFAULT '{"description":"queue","categories":"queue","attributes":"queue","hours":"queue","media":"queue","services":"queue","website":"queue"}'::jsonb;

-- Drop the old profile_updates column since it's replaced by per-skill config
ALTER TABLE location_agent_config
  DROP COLUMN IF EXISTS profile_updates;
