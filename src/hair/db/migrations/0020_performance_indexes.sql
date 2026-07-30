-- Phase J: composite indexes for ledger timeline and paid-invoice reporting

CREATE INDEX IF NOT EXISTS fyh_financial_ledger_customer_created_idx
  ON fyh_financial_ledger (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS fyh_invoices_paid_status_idx
  ON fyh_invoices (paid_at DESC, status)
  WHERE paid_at IS NOT NULL;
