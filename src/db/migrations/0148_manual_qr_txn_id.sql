-- Manual QR + transaction ID verification (v2)
-- Registry guarantees at most one approved use of a normalized txn ID across proof kinds.
-- Screenshot columns retained (nullable); possible_duplicate flags for soft matching.

CREATE TABLE IF NOT EXISTS pg_approved_transaction_refs (
  transaction_ref_normalized text PRIMARY KEY,
  source_kind text NOT NULL,
  source_id uuid NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  approved_by_admin_id uuid
);

CREATE INDEX IF NOT EXISTS pg_approved_transaction_refs_source_idx
  ON pg_approved_transaction_refs (source_kind, source_id);

-- pg_payment_records
ALTER TABLE pg_payment_records
  ADD COLUMN IF NOT EXISTS possible_duplicate boolean NOT NULL DEFAULT false;
ALTER TABLE pg_payment_records
  ADD COLUMN IF NOT EXISTS duplicate_of_ids uuid[] NOT NULL DEFAULT '{}';

-- rent_invoices
ALTER TABLE rent_invoices
  ADD COLUMN IF NOT EXISTS payment_proof_transaction_ref text;
ALTER TABLE rent_invoices
  ADD COLUMN IF NOT EXISTS possible_duplicate boolean NOT NULL DEFAULT false;
ALTER TABLE rent_invoices
  ADD COLUMN IF NOT EXISTS duplicate_of_ids uuid[] NOT NULL DEFAULT '{}';

-- electricity_invoices
ALTER TABLE electricity_invoices
  ADD COLUMN IF NOT EXISTS payment_proof_transaction_ref text;
ALTER TABLE electricity_invoices
  ADD COLUMN IF NOT EXISTS possible_duplicate boolean NOT NULL DEFAULT false;
ALTER TABLE electricity_invoices
  ADD COLUMN IF NOT EXISTS duplicate_of_ids uuid[] NOT NULL DEFAULT '{}';

-- stay_extensions (transaction ref already exists)
ALTER TABLE stay_extensions
  ADD COLUMN IF NOT EXISTS possible_duplicate boolean NOT NULL DEFAULT false;
ALTER TABLE stay_extensions
  ADD COLUMN IF NOT EXISTS duplicate_of_ids uuid[] NOT NULL DEFAULT '{}';

-- payment_links
ALTER TABLE payment_links
  ADD COLUMN IF NOT EXISTS payment_proof_transaction_ref text;
ALTER TABLE payment_links
  ADD COLUMN IF NOT EXISTS possible_duplicate boolean NOT NULL DEFAULT false;
ALTER TABLE payment_links
  ADD COLUMN IF NOT EXISTS duplicate_of_ids uuid[] NOT NULL DEFAULT '{}';

-- playstation_memberships
ALTER TABLE playstation_memberships
  ADD COLUMN IF NOT EXISTS possible_duplicate boolean NOT NULL DEFAULT false;
ALTER TABLE playstation_memberships
  ADD COLUMN IF NOT EXISTS duplicate_of_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON TABLE pg_approved_transaction_refs IS
  'Partial-unique backstop: one approved normalized UPI transaction ID across PG proof kinds.';
