-- Post-checkout uncollected deposit status + received deposit snapshot on settlements.

ALTER TYPE deposit_collection_status ADD VALUE IF NOT EXISTS 'closed_uncollected';

ALTER TABLE checkout_settlements
  ADD COLUMN IF NOT EXISTS deposit_received_paise bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN checkout_settlements.deposit_received_paise IS
  'Ledger collected deposit at settlement creation — refund base snapshot, not required deposit.';
