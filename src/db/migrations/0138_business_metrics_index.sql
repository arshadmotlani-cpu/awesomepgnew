-- Room OS Wave 6 — business metrics materialized rollup index.

CREATE TABLE IF NOT EXISTS business_metrics_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pg_id uuid NOT NULL REFERENCES pgs (id) ON DELETE CASCADE,
  billing_month date NOT NULL,
  content_hash text NOT NULL,
  snapshot jsonb NOT NULL,
  snapshot_version integer NOT NULL DEFAULT 1,
  computed_at timestamptz NOT NULL,
  source_event_id uuid,
  materialized_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_metrics_index_pg_month_unique UNIQUE (pg_id, billing_month)
);

CREATE INDEX IF NOT EXISTS business_metrics_index_pg_materialized_idx
  ON business_metrics_index (pg_id, materialized_at);

COMMENT ON TABLE business_metrics_index IS
  'Materialized business metrics rollup — truth level 3 serve cache (Wave 6).';
