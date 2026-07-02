-- Structured deposit deduction categories for Refund Console + Other Income routing.

ALTER TABLE deposit_ledger
  ADD COLUMN IF NOT EXISTS deduction_category text;

CREATE INDEX IF NOT EXISTS deposit_ledger_deduction_category_idx
  ON deposit_ledger (deduction_category)
  WHERE deduction_category IS NOT NULL;

COMMENT ON COLUMN deposit_ledger.deduction_category IS
  'Structured category: electricity, notice_policy, five_day_policy, damage, cleaning, mattress, furniture, lock, key, penalty, miscellaneous';
