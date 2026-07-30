-- Historical sales import: batch audit + invoice source extension

CREATE TABLE IF NOT EXISTS fyh_historical_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  file_sha256 text NOT NULL,
  uploaded_by_admin_id uuid REFERENCES fyh_admin_users (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'running',
  summary jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fyh_historical_import_batches_status_check CHECK (
    status IN ('running', 'completed', 'failed')
  )
);

CREATE INDEX IF NOT EXISTS fyh_historical_import_batches_sha_idx
  ON fyh_historical_import_batches (file_sha256, status);

CREATE TABLE IF NOT EXISTS fyh_historical_import_row_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES fyh_historical_import_batches (id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  row_key text,
  error_message text NOT NULL,
  raw_row jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fyh_historical_import_row_errors_batch_idx
  ON fyh_historical_import_row_errors (batch_id, row_number);

ALTER TABLE fyh_invoices
  ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES fyh_historical_import_batches (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS import_row_key text;

CREATE UNIQUE INDEX IF NOT EXISTS fyh_invoices_import_row_key_uidx
  ON fyh_invoices (import_row_key)
  WHERE import_row_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fyh_invoices_import_batch_row_uidx
  ON fyh_invoices (import_batch_id, import_row_key)
  WHERE import_batch_id IS NOT NULL AND import_row_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS fyh_invoices_import_batch_idx ON fyh_invoices (import_batch_id);

COMMENT ON COLUMN fyh_invoices.import_row_key IS 'Idempotency key for historical import rows';
