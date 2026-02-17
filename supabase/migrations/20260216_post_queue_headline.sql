-- ============================================================
-- Migration: Add headline column to gbp_post_queue
--
-- Short label for what the post is about. Used for:
-- 1. Deduplication — avoid generating posts on the same topic
-- 2. Image generation — headline text appears on the image
-- 3. Display — shown in work queue and post review UI
-- ============================================================

ALTER TABLE gbp_post_queue ADD COLUMN IF NOT EXISTS headline text;
