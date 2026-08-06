-- Vendor Brain freeze: payment numbers, reversals, attachments, audit, notes

ALTER TABLE fyh_vendor_payments
  ADD COLUMN IF NOT EXISTS payment_number text,
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_content_type text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by_staff_name text,
  ADD COLUMN IF NOT EXISTS reversed_by_employee_id uuid,
  ADD COLUMN IF NOT EXISTS reversal_reason text;

UPDATE fyh_vendor_payments
SET payment_number = 'VP-' || upper(substr(replace(id::text, '-', ''), 1, 10))
WHERE payment_number IS NULL;

ALTER TABLE fyh_vendor_payments
  ALTER COLUMN payment_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fyh_vendor_payments_number_idx ON fyh_vendor_payments (payment_number);
CREATE INDEX IF NOT EXISTS fyh_vendor_payments_status_idx ON fyh_vendor_payments (status);

ALTER TABLE fyh_purchases
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_content_type text,
  ADD COLUMN IF NOT EXISTS attachment_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS attachment_uploaded_by text;

CREATE TABLE IF NOT EXISTS fyh_purchase_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES fyh_purchases(id) ON DELETE CASCADE,
  action text NOT NULL,
  diff jsonb NOT NULL DEFAULT '{}',
  staff_name text NOT NULL,
  staff_employee_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fyh_purchase_audit_events_purchase_idx ON fyh_purchase_audit_events (purchase_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fyh_vendor_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES fyh_vendors(id) ON DELETE CASCADE,
  note text NOT NULL,
  staff_name text NOT NULL,
  staff_employee_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fyh_vendor_notes_vendor_idx ON fyh_vendor_notes (vendor_id, created_at DESC);
