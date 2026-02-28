-- ============================================================
-- Migration: Add posts_last_generated_at to locations
--
-- Tracks when each location last had its post batch generated.
-- Used by the hourly post-generate cron to implement rolling
-- 30-day per-location generation cycles instead of a single
-- monthly blast for all locations.
-- ============================================================

ALTER TABLE locations ADD COLUMN IF NOT EXISTS posts_last_generated_at timestamptz;
