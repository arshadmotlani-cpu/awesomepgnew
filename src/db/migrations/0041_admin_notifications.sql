-- Admin notifications: unread/read/archived per admin (WhatsApp-style badges).

CREATE TYPE admin_notification_state AS ENUM ('unread', 'read', 'archived');

CREATE TABLE IF NOT EXISTS admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL,
  type action_item_type NOT NULL,
  title text NOT NULL,
  pg_id uuid NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  resident_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  href text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_notifications_source_key_unique
  ON admin_notifications (source_key);

CREATE INDEX IF NOT EXISTS admin_notifications_type_created_idx
  ON admin_notifications (type, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_notification_states (
  admin_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES admin_notifications(id) ON DELETE CASCADE,
  state admin_notification_state NOT NULL DEFAULT 'unread',
  read_at timestamptz,
  archived_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (admin_id, notification_id)
);

CREATE INDEX IF NOT EXISTS admin_notification_states_admin_unread_idx
  ON admin_notification_states (admin_id, state);
