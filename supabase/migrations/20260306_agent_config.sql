-- Agent configuration per location.
-- Controls what the autonomous agent can do without human approval.

CREATE TABLE IF NOT EXISTS location_agent_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,

  -- Trust levels per action type: 'auto' | 'queue' | 'off'
  -- 'auto'  = agent executes without approval
  -- 'queue' = agent generates, queues for human approval
  -- 'off'   = agent skips this action type entirely
  review_replies TEXT NOT NULL DEFAULT 'queue' CHECK (review_replies IN ('auto', 'queue', 'off')),
  profile_updates TEXT NOT NULL DEFAULT 'queue' CHECK (profile_updates IN ('auto', 'queue', 'off')),
  post_publishing TEXT NOT NULL DEFAULT 'queue' CHECK (post_publishing IN ('auto', 'queue', 'off')),

  -- Guardrails
  auto_reply_max_rating INTEGER DEFAULT 5,        -- only auto-reply up to this rating
  auto_reply_min_rating INTEGER DEFAULT 4,        -- only auto-reply down to this rating
  escalate_below_rating INTEGER DEFAULT 3,        -- always queue reviews below this

  -- Brand voice
  tone TEXT DEFAULT 'professional and friendly',
  business_context TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(location_id)
);

-- Agent activity log — everything the agent does.
CREATE TABLE IF NOT EXISTS agent_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'review_reply',
    'profile_update',
    'post_published',
    'post_generated',
    'audit_completed',
    'recommendation_applied',
    'recommendation_queued',
    'escalated'
  )),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'queued', 'failed', 'escalated')),
  summary TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_activity_location
  ON agent_activity_log(location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_activity_type
  ON agent_activity_log(action_type, created_at DESC);

-- RLS
ALTER TABLE location_agent_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_config_select" ON location_agent_config;
CREATE POLICY "agent_config_select" ON location_agent_config
  FOR SELECT USING (location_id IN (SELECT get_user_location_ids()));

DROP POLICY IF EXISTS "agent_config_all" ON location_agent_config;
CREATE POLICY "agent_config_all" ON location_agent_config
  FOR ALL USING (location_id IN (SELECT get_user_location_ids()));

DROP POLICY IF EXISTS "agent_activity_select" ON agent_activity_log;
CREATE POLICY "agent_activity_select" ON agent_activity_log
  FOR SELECT USING (location_id IN (SELECT get_user_location_ids()));

DROP POLICY IF EXISTS "agent_activity_insert" ON agent_activity_log;
CREATE POLICY "agent_activity_insert" ON agent_activity_log
  FOR INSERT WITH CHECK (true);
