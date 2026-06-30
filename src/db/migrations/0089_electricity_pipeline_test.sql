-- Pipeline test electricity bills/invoices: full UI path, excluded from room reconciliation & revenue.

ALTER TABLE electricity_bills
  ADD COLUMN IF NOT EXISTS is_pipeline_test boolean NOT NULL DEFAULT false;

ALTER TABLE electricity_invoices
  ADD COLUMN IF NOT EXISTS is_pipeline_test boolean NOT NULL DEFAULT false;

ALTER TABLE electricity_bills DROP CONSTRAINT IF EXISTS electricity_bills_room_month_unique;
DROP INDEX IF EXISTS electricity_bills_room_month_unique;
CREATE UNIQUE INDEX electricity_bills_room_month_unique
  ON electricity_bills (room_id, billing_month)
  WHERE is_pipeline_test = false;

ALTER TABLE electricity_invoices DROP CONSTRAINT IF EXISTS electricity_invoices_room_month_customer_active_unique;
DROP INDEX IF EXISTS electricity_invoices_room_month_customer_active_unique;
CREATE UNIQUE INDEX electricity_invoices_room_month_customer_active_unique
  ON electricity_invoices (room_id, billing_month, customer_id)
  WHERE status <> 'cancelled'
    AND superseded_by_invoice_id IS NULL
    AND is_pipeline_test = false;

CREATE INDEX IF NOT EXISTS electricity_bills_pipeline_test_idx
  ON electricity_bills (is_pipeline_test)
  WHERE is_pipeline_test = true;

CREATE INDEX IF NOT EXISTS electricity_invoices_pipeline_test_idx
  ON electricity_invoices (is_pipeline_test)
  WHERE is_pipeline_test = true;
