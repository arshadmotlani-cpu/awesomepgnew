-- Wave 2 — durable Health Brain issue store + repair telemetry.
-- Idempotent: safe when types/tables already exist from a prior partial apply.

DO $$ BEGIN
  CREATE TYPE brain_issue_status AS ENUM (
    'open',
    'repair_available',
    'queued',
    'running',
    'repaired',
    'failed',
    'needs_owner',
    'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE brain_repair_trigger AS ENUM ('cron', 'ui', 'script');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS brain_integrity_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL,
  brain TEXT NOT NULL,
  code TEXT NOT NULL,
  severity TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  cause TEXT NOT NULL,
  suggested_repair TEXT NOT NULL,
  repair_fn TEXT,
  auto_repairable BOOLEAN NOT NULL DEFAULT false,
  status brain_issue_status NOT NULL DEFAULT 'open',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  repaired_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS brain_integrity_issues_fingerprint_uidx
  ON brain_integrity_issues (fingerprint);

CREATE INDEX IF NOT EXISTS brain_integrity_issues_open_idx
  ON brain_integrity_issues (brain, status, severity)
  WHERE status IN ('open', 'repair_available', 'queued', 'running', 'failed', 'needs_owner');

CREATE TABLE IF NOT EXISTS brain_repair_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger brain_repair_trigger NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER,
  query_count INTEGER NOT NULL DEFAULT 0,
  rows_repaired INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  rows_failed INTEGER NOT NULL DEFAULT 0,
  health_score_before NUMERIC(6, 2),
  health_score_after NUMERIC(6, 2),
  billing_month DATE,
  summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brain_repair_runs_started_idx
  ON brain_repair_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS brain_repair_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES brain_repair_runs(id) ON DELETE CASCADE,
  issue_id UUID REFERENCES brain_integrity_issues(id) ON DELETE SET NULL,
  fingerprint TEXT,
  repair_fn TEXT NOT NULL,
  result TEXT NOT NULL,
  error TEXT,
  duration_ms INTEGER,
  rows_touched INTEGER NOT NULL DEFAULT 0,
  diff JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brain_repair_events_run_idx
  ON brain_repair_events (run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS brain_repair_events_issue_idx
  ON brain_repair_events (issue_id, created_at DESC);
