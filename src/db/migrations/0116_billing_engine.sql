-- Billing engine: failure auto-retry + resident credit ledger.

ALTER TABLE billing_generation_failures
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

CREATE TYPE resident_credit_entry_kind AS ENUM ('credit', 'debit', 'applied');

CREATE TABLE IF NOT EXISTS resident_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  entry_kind resident_credit_entry_kind NOT NULL,
  amount_paise bigint NOT NULL,
  reason text NOT NULL,
  related_rent_invoice_id uuid REFERENCES rent_invoices(id) ON DELETE SET NULL,
  related_electricity_invoice_id uuid REFERENCES electricity_invoices(id) ON DELETE SET NULL,
  related_payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  created_by_admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resident_credit_ledger_amount_sign_check CHECK (
    (entry_kind = 'credit' AND amount_paise > 0)
    OR (entry_kind IN ('debit', 'applied') AND amount_paise < 0)
  )
);

CREATE INDEX IF NOT EXISTS resident_credit_ledger_customer_idx
  ON resident_credit_ledger (customer_id);

CREATE INDEX IF NOT EXISTS resident_credit_ledger_booking_idx
  ON resident_credit_ledger (booking_id);

CREATE UNIQUE INDEX IF NOT EXISTS resident_credit_ledger_applied_rent_invoice_uidx
  ON resident_credit_ledger (related_rent_invoice_id)
  WHERE entry_kind = 'applied' AND related_rent_invoice_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS resident_credit_ledger_applied_elec_invoice_uidx
  ON resident_credit_ledger (related_electricity_invoice_id)
  WHERE entry_kind = 'applied' AND related_electricity_invoice_id IS NOT NULL;
