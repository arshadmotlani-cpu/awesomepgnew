-- Vendor Ledger: payments, allocations, purchase returns

CREATE TABLE IF NOT EXISTS fyh_vendor_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES fyh_vendors(id) ON DELETE RESTRICT,
  amount_paise bigint NOT NULL,
  payment_method text NOT NULL,
  payment_date date NOT NULL,
  reference text,
  notes text,
  staff_name text NOT NULL,
  staff_employee_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fyh_vendor_payments_vendor_idx ON fyh_vendor_payments (vendor_id);
CREATE INDEX IF NOT EXISTS fyh_vendor_payments_date_idx ON fyh_vendor_payments (payment_date DESC);

CREATE TABLE IF NOT EXISTS fyh_vendor_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES fyh_vendor_payments(id) ON DELETE CASCADE,
  payable_id uuid NOT NULL REFERENCES fyh_vendor_payables(id) ON DELETE RESTRICT,
  amount_paise bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fyh_vendor_payment_allocations_amount_positive CHECK (amount_paise > 0)
);

CREATE INDEX IF NOT EXISTS fyh_vendor_payment_alloc_alloc_idx ON fyh_vendor_payment_allocations (payable_id);
CREATE INDEX IF NOT EXISTS fyh_vendor_payment_alloc_payment_idx ON fyh_vendor_payment_allocations (payment_id);

CREATE TABLE IF NOT EXISTS fyh_purchase_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES fyh_purchases(id) ON DELETE RESTRICT,
  payable_id uuid NOT NULL REFERENCES fyh_vendor_payables(id) ON DELETE RESTRICT,
  vendor_id uuid NOT NULL REFERENCES fyh_vendors(id) ON DELETE RESTRICT,
  return_date date NOT NULL,
  credit_paise bigint NOT NULL DEFAULT 0,
  notes text,
  staff_name text NOT NULL,
  staff_employee_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fyh_purchase_returns_credit_positive CHECK (credit_paise > 0)
);

CREATE INDEX IF NOT EXISTS fyh_purchase_returns_purchase_idx ON fyh_purchase_returns (purchase_id);
CREATE INDEX IF NOT EXISTS fyh_purchase_returns_vendor_idx ON fyh_purchase_returns (vendor_id);

CREATE TABLE IF NOT EXISTS fyh_purchase_return_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES fyh_purchase_returns(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES fyh_products(id) ON DELETE RESTRICT,
  quantity numeric(12, 2) NOT NULL DEFAULT 0,
  unit_cost_paise bigint NOT NULL DEFAULT 0,
  line_credit_paise bigint NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS fyh_purchase_return_lines_return_idx ON fyh_purchase_return_lines (return_id);
