-- Consolidated migration for all monitoring cron action types
-- Replaces: 20260308_score_drop_alerts.sql, 20260308_citation_followup_action_type.sql,
--           20260308_correction_pattern_action_type.sql, 20260308_post_performance_action_type.sql

-- Expand agent_activity_log action_type to include all monitoring actions
ALTER TABLE agent_activity_log DROP CONSTRAINT IF EXISTS agent_activity_log_action_type_check;
ALTER TABLE agent_activity_log ADD CONSTRAINT agent_activity_log_action_type_check
  CHECK (action_type IN (
    -- Original action types
    'audit_completed',
    'review_reply', 'review_escalation',
    'description_optimization', 'recommendation_applied', 'recommendation_queued',
    'category_update', 'attribute_update',
    'media_recommendation', 'service_update',
    'hours_update', 'website_update',
    'post_promotion', 'post_creation',
    'profile_update',
    -- Monitoring cron action types
    'score_drop_alert',
    'performance_correlation',
    'response_time_alert',
    'recommendation_effectiveness',
    'post_generated',
    'citation_followup',
    'competitor_tracking',
    'correction_pattern',
    'post_performance'
  ));

-- Add 'seasonal' as a valid source for gbp_post_topics
ALTER TABLE gbp_post_topics DROP CONSTRAINT IF EXISTS gbp_post_topics_source_check;
ALTER TABLE gbp_post_topics ADD CONSTRAINT gbp_post_topics_source_check
  CHECK (source IN ('ai', 'manual', 'seasonal'));
