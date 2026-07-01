-- Electricity invoice deduplication + generation job tracking.
-- One active invoice per resident per room per billing month.

ALTER TABLE electricity_invoices
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES rooms(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS superseded_by_invoice_id uuid REFERENCES electricity_invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duplicate_detected_at timestamptz;

UPDATE electricity_invoices ei
SET room_id = eb.room_id
FROM electricity_bills eb
WHERE ei.electricity_bill_id = eb.id
  AND ei.room_id IS NULL;

-- Legacy rows without a bill link cannot satisfy room_id — cancel so deploy can proceed.
UPDATE electricity_invoices
SET status = 'cancelled'
WHERE room_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM electricity_invoices WHERE room_id IS NULL) THEN
    RAISE EXCEPTION
      'electricity_invoices.room_id is still NULL after backfill — fix orphan rows before re-deploying';
  END IF;
  ALTER TABLE electricity_invoices ALTER COLUMN room_id SET NOT NULL;
END $$;

CREATE INDEX IF NOT EXISTS electricity_invoices_room_month_customer_idx
  ON electricity_invoices (room_id, billing_month, customer_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM electricity_invoices ei
    WHERE ei.status <> 'cancelled'
      AND ei.superseded_by_invoice_id IS NULL
    GROUP BY ei.room_id, ei.billing_month, ei.customer_id
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS electricity_invoices_room_month_customer_active_unique
      ON electricity_invoices (room_id, billing_month, customer_id)
      WHERE status <> 'cancelled' AND superseded_by_invoice_id IS NULL;
  END IF;
END $$;

CREATE TYPE electricity_bill_generation_job_status AS ENUM (
  'running',
  'success',
  'failed',
  'duplicate'
);

CREATE TABLE IF NOT EXISTS electricity_bill_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  billing_month date NOT NULL,
  admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  status electricity_bill_generation_job_status NOT NULL DEFAULT 'running',
  bill_id uuid REFERENCES electricity_bills(id) ON DELETE SET NULL,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS electricity_bill_generation_jobs_request_id_unique
  ON electricity_bill_generation_jobs (request_id);

CREATE UNIQUE INDEX IF NOT EXISTS electricity_bill_generation_jobs_active_room_month_unique
  ON electricity_bill_generation_jobs (room_id, billing_month)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS electricity_bill_generation_jobs_room_month_idx
  ON electricity_bill_generation_jobs (room_id, billing_month, started_at DESC);
