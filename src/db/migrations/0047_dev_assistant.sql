-- In-app AI Developer Assistant (admin-only internal tool).

CREATE TABLE IF NOT EXISTS dev_assistant_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New conversation',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dev_assistant_conversations_admin_idx
  ON dev_assistant_conversations (admin_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS dev_assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES dev_assistant_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  context_snapshot jsonb,
  screenshot_data_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dev_assistant_messages_conversation_idx
  ON dev_assistant_messages (conversation_id, created_at ASC);
