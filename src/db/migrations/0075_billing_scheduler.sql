-- Billing cycle fields on resident profiles + scheduler observability.

ALTER TABLE resident_billing_profiles
  DROP CONSTRAINT IF EXISTS resident_billing_profiles_billing_day_check;

ALTER TABLE resident_billing_profiles
  ADD CONSTRAINT resident_billing_profiles_billing_day_check
  CHECK (billing_day BETWEEN 1 AND 31);

ALTER TABLE resident_billing_profiles
  ADD COLUMN IF NOT EXISTS billing_anchor_date date,
  ADD COLUMN IF NOT EXISTS first_auto_billing_date date,
  ADD COLUMN IF NOT EXISTS last_auto_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_auto_billing_month date;

CREATE TYPE billing_generation_run_status AS ENUM ('running', 'success', 'partial', 'failed');

CREATE TABLE IF NOT EXISTS billing_generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date date NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status billing_generation_run_status NOT NULL DEFAULT 'running',
  candidate_count integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  triggered_by text NOT NULL DEFAULT 'system',
  summary jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS billing_generation_runs_run_date_idx
  ON billing_generation_runs (run_date DESC);

CREATE TABLE IF NOT EXISTS billing_generation_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES billing_generation_runs(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  pg_id uuid REFERENCES pgs(id) ON DELETE SET NULL,
  billing_month date,
  error_code text,
  error_message text NOT NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_generation_failures_run_idx
  ON billing_generation_failures (run_id);

CREATE INDEX IF NOT EXISTS billing_generation_failures_unresolved_idx
  ON billing_generation_failures (resolved_at)
  WHERE resolved_at IS NULL;
