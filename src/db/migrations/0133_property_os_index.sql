-- Room OS materialized property index — Wave 2.
-- Truth level 3 serve cache for PropertyOsIndexSnapshot.

CREATE TABLE IF NOT EXISTS property_os_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pg_id uuid NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  billing_month date NOT NULL,
  as_of date NOT NULL,
  content_hash text NOT NULL,
  snapshot jsonb NOT NULL,
  snapshot_version integer NOT NULL DEFAULT 1,
  computed_at timestamptz NOT NULL,
  source_event_id uuid,
  materialized_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS property_os_index_pg_month_unique
  ON property_os_index (pg_id, billing_month);

CREATE INDEX IF NOT EXISTS property_os_index_pg_materialized_idx
  ON property_os_index (pg_id, materialized_at DESC);

COMMENT ON TABLE property_os_index IS
  'Materialized Property OS index snapshot (KPI + room index + queue summary + elec progress).';
