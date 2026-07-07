-- Freeze rent invoice payable amounts at payment-proof submission (not at generation).
ALTER TABLE rent_invoices
  ADD COLUMN IF NOT EXISTS proof_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS proof_snapshot_outstanding_paise bigint,
  ADD COLUMN IF NOT EXISTS proof_snapshot_late_fee_paise bigint,
  ADD COLUMN IF NOT EXISTS proof_snapshot_principal_due_paise bigint;

COMMENT ON COLUMN rent_invoices.proof_submitted_at IS
  'When the resident uploaded payment proof; late-fee accrual stops after this moment.';
COMMENT ON COLUMN rent_invoices.proof_snapshot_outstanding_paise IS
  'Total outstanding paise frozen at proof submission — used for admin approval.';
COMMENT ON COLUMN rent_invoices.proof_snapshot_late_fee_paise IS
  'Accrued late fee paise frozen at proof submission.';
COMMENT ON COLUMN rent_invoices.proof_snapshot_principal_due_paise IS
  'Net rent principal still owed at proof submission (after discount, before late fee).';

-- Best-effort anchor for in-flight reviews; app backfills paise from this timestamp.
UPDATE rent_invoices
SET proof_submitted_at = updated_at
WHERE payment_proof_url IS NOT NULL
  AND proof_submitted_at IS NULL;
