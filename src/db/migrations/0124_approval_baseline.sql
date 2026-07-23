ALTER TABLE checkout_settlements
  ADD COLUMN IF NOT EXISTS approval_baseline_locked boolean NOT NULL DEFAULT false;
