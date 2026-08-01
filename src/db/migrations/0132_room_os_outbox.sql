-- Room OS transactional outbox — Wave 0.
-- Separate from billing_events (collections lifecycle audit).

CREATE TABLE IF NOT EXISTS room_os_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE,
  stream_type text NOT NULL,
  stream_id uuid NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  rules_effective_pack_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_ref text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  processed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS room_os_outbox_status_created_idx
  ON room_os_outbox (status, created_at);

CREATE INDEX IF NOT EXISTS room_os_outbox_stream_idx
  ON room_os_outbox (stream_type, stream_id, occurred_at);

CREATE INDEX IF NOT EXISTS room_os_outbox_event_type_idx
  ON room_os_outbox (event_type);

COMMENT ON TABLE room_os_outbox IS
  'Transactional outbox for Room OS domain events. Projectors consume pending rows.';
