-- ============================================================
-- Migration: Chat conversations for Ask Rev
--
-- 1. chat_conversations — persisted conversation sessions
-- 2. chat_messages — individual messages (user, assistant, tool audit trail)
-- ============================================================

-- 1. Conversations -----------------------------------------------

CREATE TABLE chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_conversations_user ON chat_conversations(user_id, updated_at DESC);
CREATE INDEX idx_chat_conversations_org ON chat_conversations(org_id);

CREATE TRIGGER chat_conversations_updated_at
  BEFORE UPDATE ON chat_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: users see only their own conversations
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_conversations" ON chat_conversations;
CREATE POLICY "users_own_conversations" ON chat_conversations
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Messages ----------------------------------------------------

CREATE TABLE chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool_call', 'tool_result')),
  content text,
  tool_name text,
  tool_input jsonb,
  tool_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_conversation ON chat_messages(conversation_id, created_at);

-- RLS: access via conversation ownership
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_messages" ON chat_messages;
CREATE POLICY "users_own_messages" ON chat_messages
  FOR ALL TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM chat_conversations WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM chat_conversations WHERE user_id = auth.uid()
    )
  );
