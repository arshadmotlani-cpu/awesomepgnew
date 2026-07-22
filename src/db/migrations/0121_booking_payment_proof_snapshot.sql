-- Freeze booking checkout expected amounts at proof submit (mirrors rent_invoices proof_snapshot_*).

ALTER TABLE pg_payment_records
  ADD COLUMN IF NOT EXISTS proof_snapshot_checkout_total_paise bigint,
  ADD COLUMN IF NOT EXISTS proof_snapshot_rent_due_paise bigint,
  ADD COLUMN IF NOT EXISTS proof_snapshot_deposit_due_paise bigint,
  ADD COLUMN IF NOT EXISTS proof_snapshot_prior_outstanding_paise bigint,
  ADD COLUMN IF NOT EXISTS proof_snapshot_prior_outstanding_json jsonb;

COMMENT ON COLUMN pg_payment_records.proof_snapshot_checkout_total_paise IS
  'Expected checkout total at proof submit — used for admin review, not live recomputation.';
COMMENT ON COLUMN pg_payment_records.proof_snapshot_rent_due_paise IS
  'Rent portion of expected checkout at proof submit.';
COMMENT ON COLUMN pg_payment_records.proof_snapshot_deposit_due_paise IS
  'Deposit cash due at proof submit (after admin credit).';
COMMENT ON COLUMN pg_payment_records.proof_snapshot_prior_outstanding_paise IS
  'Prior stay balance included in checkout at proof submit.';
COMMENT ON COLUMN pg_payment_records.proof_snapshot_prior_outstanding_json IS
  'Line items for prior outstanding at proof submit.';
