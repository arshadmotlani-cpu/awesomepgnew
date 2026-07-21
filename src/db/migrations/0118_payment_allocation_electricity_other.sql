-- Extend payment approval allocation audit for electricity + other splits.

ALTER TABLE payment_approval_allocations
  ADD COLUMN IF NOT EXISTS electricity_paid_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_paid_paise bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN payment_approval_allocations.electricity_paid_paise IS
  'Admin-allocated portion applied to electricity invoices at approval.';
COMMENT ON COLUMN payment_approval_allocations.other_paid_paise IS
  'Admin-allocated portion applied to advance credit / other at approval.';
