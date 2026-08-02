-- Room OS outbox retry — Wave 2 operational infrastructure.

ALTER TABLE room_os_outbox
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

ALTER TABLE room_os_outbox
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

CREATE INDEX IF NOT EXISTS room_os_outbox_retry_idx
  ON room_os_outbox (status, next_retry_at, created_at);

COMMENT ON COLUMN room_os_outbox.attempt_count IS
  'Projector processing attempts; permanent fail after max retries.';

COMMENT ON COLUMN room_os_outbox.next_retry_at IS
  'When a retryable failed row becomes eligible for reprocessing.';
