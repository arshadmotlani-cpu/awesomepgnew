-- Cursor-style dev assistant: ASK / PLAN / AGENT modes + task workflow.

ALTER TABLE dev_assistant_conversations
  ADD COLUMN IF NOT EXISTS active_mode text NOT NULL DEFAULT 'ask'
    CHECK (active_mode IN ('ask', 'plan', 'agent'));

ALTER TABLE dev_assistant_messages
  ADD COLUMN IF NOT EXISTS mode text CHECK (mode IN ('ask', 'plan', 'agent')),
  ADD COLUMN IF NOT EXISTS metadata jsonb;

CREATE TABLE IF NOT EXISTS dev_assistant_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES dev_assistant_conversations(id) ON DELETE SET NULL,
  source_message_id uuid,
  title text NOT NULL,
  instruction text NOT NULL,
  plan_markdown text,
  status text NOT NULL DEFAULT 'analyzing'
    CHECK (status IN (
      'analyzing', 'planning', 'implementing', 'testing', 'deploying',
      'completed', 'failed', 'cancelled'
    )),
  result_summary text,
  implementation_notes text,
  deployment_id text,
  deployment_version text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dev_assistant_tasks_admin_idx
  ON dev_assistant_tasks (admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS dev_assistant_tasks_status_idx
  ON dev_assistant_tasks (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS dev_assistant_task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES dev_assistant_tasks(id) ON DELETE CASCADE,
  status text NOT NULL,
  message text NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dev_assistant_task_events_task_idx
  ON dev_assistant_task_events (task_id, created_at ASC);
