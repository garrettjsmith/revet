-- Work queue support: partial indexes for efficient queue queries

-- Index for unreplied reviews with AI drafts (queue: "AI draft ready for approval")
CREATE INDEX IF NOT EXISTS idx_reviews_ai_draft_pending
  ON reviews(location_id, ai_draft_generated_at)
  WHERE ai_draft IS NOT NULL AND reply_body IS NULL AND status != 'archived';

-- Index for unreplied negative reviews (queue: "negative review needs reply")
CREATE INDEX IF NOT EXISTS idx_reviews_unreplied_negative
  ON reviews(location_id)
  WHERE status = 'new' AND sentiment = 'negative' AND reply_body IS NULL;
