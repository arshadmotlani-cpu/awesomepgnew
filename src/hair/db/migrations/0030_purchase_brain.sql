-- Purchase Brain Phase 2: purchases, payables, expense link

CREATE TABLE IF NOT EXISTS fyh_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES fyh_vendors(id) ON DELETE RESTRICT,
  purchase_number text NOT NULL UNIQUE,
  vendor_invoice_ref text,
  purchase_date date NOT NULL,
  total_paise bigint NOT NULL DEFAULT 0,
  notes text,
  status text NOT NULL DEFAULT 'posted',
  staff_name text NOT NULL,
  staff_employee_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fyh_purchases_vendor_idx ON fyh_purchases (vendor_id);
CREATE INDEX IF NOT EXISTS fyh_purchases_date_idx ON fyh_purchases (purchase_date DESC);

CREATE TABLE IF NOT EXISTS fyh_purchase_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES fyh_purchases(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES fyh_products(id) ON DELETE RESTRICT,
  quantity numeric(12, 2) NOT NULL DEFAULT 0,
  unit_cost_paise bigint NOT NULL DEFAULT 0,
  line_total_paise bigint NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS fyh_purchase_lines_purchase_idx ON fyh_purchase_lines (purchase_id);

CREATE TABLE IF NOT EXISTS fyh_vendor_payables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES fyh_vendors(id) ON DELETE RESTRICT,
  -- One payable per purchase invoice (not an aggregated vendor balance).
  purchase_id uuid NOT NULL UNIQUE REFERENCES fyh_purchases(id) ON DELETE CASCADE,
  amount_paise bigint NOT NULL DEFAULT 0,
  balance_paise bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fyh_vendor_payables_vendor_idx ON fyh_vendor_payables (vendor_id);
CREATE INDEX IF NOT EXISTS fyh_vendor_payables_status_idx ON fyh_vendor_payables (status);

ALTER TABLE fyh_expenses
  ADD COLUMN IF NOT EXISTS purchase_id uuid REFERENCES fyh_purchases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS fyh_expenses_purchase_idx ON fyh_expenses (purchase_id);
