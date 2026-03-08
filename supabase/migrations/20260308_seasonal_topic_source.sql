-- Add 'seasonal' as a valid source for gbp_post_topics
ALTER TABLE gbp_post_topics DROP CONSTRAINT IF EXISTS gbp_post_topics_source_check;
ALTER TABLE gbp_post_topics ADD CONSTRAINT gbp_post_topics_source_check
  CHECK (source IN ('ai', 'manual', 'seasonal'));
