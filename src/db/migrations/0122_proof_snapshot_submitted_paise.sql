-- Immutable submitted proof amount at upload — SSOT for admin review (screenshot amount).

ALTER TABLE pg_payment_records
  ADD COLUMN IF NOT EXISTS proof_snapshot_submitted_paise bigint;

COMMENT ON COLUMN pg_payment_records.proof_snapshot_submitted_paise IS
  'Resident-declared amount on payment screenshot at proof submit — used for review, not live recomputation.';
