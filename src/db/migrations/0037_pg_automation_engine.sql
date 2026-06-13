-- PG Automation Engine — event detection + outbound actions (observe & react only).

CREATE TYPE automation_event_type AS ENUM (
  'rent_due',
  'rent_overdue',
  'electricity_due',
  'electricity_overdue',
  'vacating_notice',
  'checkin',
  'checkout',
  'kyc_pending',
  'payment_received',
  'deposit_pending_refund'
);

CREATE TYPE automation_event_status AS ENUM ('pending', 'processed', 'failed');

CREATE TYPE automation_action_channel AS ENUM ('whatsapp', 'email', 'sms');

CREATE TYPE automation_action_recipient AS ENUM ('resident', 'owner', 'admin');

CREATE TYPE automation_action_status AS ENUM ('queued', 'sent', 'failed');

CREATE TABLE IF NOT EXISTS automation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pg_id uuid NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  event_type automation_event_type NOT NULL,
  trigger_date timestamptz NOT NULL,
  status automation_event_status NOT NULL DEFAULT 'pending',
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS automation_events_idempotency_key_unique
  ON automation_events (idempotency_key);

CREATE INDEX IF NOT EXISTS automation_events_status_trigger_idx
  ON automation_events (status, trigger_date);

CREATE INDEX IF NOT EXISTS automation_events_pg_type_idx
  ON automation_events (pg_id, event_type, created_at);

CREATE TABLE IF NOT EXISTS automation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES automation_events(id) ON DELETE CASCADE,
  channel automation_action_channel NOT NULL,
  recipient automation_action_recipient NOT NULL,
  template_type text NOT NULL,
  message text NOT NULL,
  status automation_action_status NOT NULL DEFAULT 'queued',
  sent_at timestamptz,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS automation_actions_event_idx ON automation_actions (event_id);

CREATE INDEX IF NOT EXISTS automation_actions_status_idx
  ON automation_actions (status, created_at);
