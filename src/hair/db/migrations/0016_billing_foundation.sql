-- Unified financial ledger + communication settings (Quick Sale billing foundation)

CREATE TABLE IF NOT EXISTS fyh_financial_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES fyh_customers (id) ON DELETE RESTRICT,
  invoice_id uuid REFERENCES fyh_invoices (id) ON DELETE SET NULL,
  account text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('debit', 'credit')),
  amount_paise bigint NOT NULL CHECK (amount_paise >= 0),
  method text,
  kind text NOT NULL,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fyh_financial_ledger_customer_idx ON fyh_financial_ledger (customer_id);
CREATE INDEX IF NOT EXISTS fyh_financial_ledger_invoice_idx ON fyh_financial_ledger (invoice_id);
CREATE INDEX IF NOT EXISTS fyh_financial_ledger_kind_idx ON fyh_financial_ledger (kind);

ALTER TABLE fyh_settings
  ADD COLUMN IF NOT EXISTS google_review_url text,
  ADD COLUMN IF NOT EXISTS communication_settings jsonb;
