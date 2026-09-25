-- FYH general expenses sector — extended fields, source, void/cancel audit

ALTER TABLE fyh_expenses
  ADD COLUMN IF NOT EXISTS expense_for text,
  ADD COLUMN IF NOT EXISTS paid_by text,
  ADD COLUMN IF NOT EXISTS bill_number text,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS reference_id text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS attachment_content_type text,
  ADD COLUMN IF NOT EXISTS created_by_employee_id uuid,
  ADD COLUMN IF NOT EXISTS updated_by_employee_id uuid,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by_employee_id uuid,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

UPDATE fyh_expenses SET source = 'purchase' WHERE purchase_id IS NOT NULL AND source = 'manual';
UPDATE fyh_expenses SET source = 'manual' WHERE source IS NULL OR source = '';

CREATE INDEX IF NOT EXISTS fyh_expenses_status_idx ON fyh_expenses (status);
CREATE INDEX IF NOT EXISTS fyh_expenses_source_idx ON fyh_expenses (source);
CREATE INDEX IF NOT EXISTS fyh_expenses_expense_for_idx ON fyh_expenses (expense_for);
CREATE INDEX IF NOT EXISTS fyh_expenses_paid_by_idx ON fyh_expenses (paid_by);

ALTER TABLE fyh_expenses DROP CONSTRAINT IF EXISTS fyh_expenses_status_check;
ALTER TABLE fyh_expenses ADD CONSTRAINT fyh_expenses_status_check
  CHECK (status IN ('active', 'cancelled'));

ALTER TABLE fyh_expenses DROP CONSTRAINT IF EXISTS fyh_expenses_source_check;
ALTER TABLE fyh_expenses ADD CONSTRAINT fyh_expenses_source_check
  CHECK (source IN ('manual', 'purchase'));

CREATE UNIQUE INDEX IF NOT EXISTS fyh_expenses_purchase_id_uidx
  ON fyh_expenses (purchase_id) WHERE purchase_id IS NOT NULL;
