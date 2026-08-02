-- Room OS materialized work queue — Wave 2.
-- Truth level 3 serve cache for WorkQueueSnapshot.

CREATE TABLE IF NOT EXISTS work_queue_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pg_id uuid NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  billing_month date NOT NULL,
  content_hash text NOT NULL,
  snapshot jsonb NOT NULL,
  snapshot_version integer NOT NULL DEFAULT 1,
  computed_at timestamptz NOT NULL,
  source_event_id uuid,
  materialized_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS work_queue_index_pg_month_unique
  ON work_queue_index (pg_id, billing_month);

CREATE INDEX IF NOT EXISTS work_queue_index_pg_materialized_idx
  ON work_queue_index (pg_id, materialized_at DESC);

COMMENT ON TABLE work_queue_index IS
  'Materialized Work Queue snapshot (operational buckets for Decision API).';
