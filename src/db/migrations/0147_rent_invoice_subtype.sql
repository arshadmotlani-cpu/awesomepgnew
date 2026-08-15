-- Transition billing-cycle migration invoices: no due date, no late fee.
DO $$ BEGIN
  CREATE TYPE rent_invoice_subtype AS ENUM ('standard', 'billing_cycle_transition');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE rent_invoices
  ADD COLUMN IF NOT EXISTS invoice_subtype rent_invoice_subtype NOT NULL DEFAULT 'standard';

ALTER TABLE rent_invoices
  ALTER COLUMN due_date DROP NOT NULL;

COMMENT ON COLUMN rent_invoices.invoice_subtype IS
  'billing_cycle_transition = migration proration bill; no due date / no late fee.';
