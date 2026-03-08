-- Add 'post_performance' to agent_activity_log action_type constraint
ALTER TABLE agent_activity_log DROP CONSTRAINT IF EXISTS agent_activity_log_action_type_check;
ALTER TABLE agent_activity_log ADD CONSTRAINT agent_activity_log_action_type_check
  CHECK (action_type IN (
    'audit_completed',
    'review_reply', 'review_escalation',
    'description_optimization', 'recommendation_applied', 'recommendation_queued',
    'category_update', 'attribute_update',
    'media_recommendation', 'service_update',
    'hours_update', 'website_update',
    'post_promotion', 'post_creation', 'post_performance',
    'profile_update'
  ));
