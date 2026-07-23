-- Checkout Settlement Engine V2 — two-bucket waterfall snapshot columns.

ALTER TABLE checkout_settlements
  ADD COLUMN IF NOT EXISTS settlement_engine_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS stay_check_in_date date,
  ADD COLUMN IF NOT EXISTS stay_checkout_date date,
  ADD COLUMN IF NOT EXISTS stay_days integer,
  ADD COLUMN IF NOT EXISTS rent_paid_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rent_consumed_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unused_rent_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notice_deduction_full_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notice_from_unused_rent_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notice_from_deposit_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unused_rent_after_notice_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS electricity_from_deposit_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_from_deposit_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_refundable_paise bigint,
  ADD COLUMN IF NOT EXISTS unused_rent_refund_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_refund_paise bigint,
  ADD COLUMN IF NOT EXISTS settlement_waterfall_json jsonb;

COMMENT ON COLUMN checkout_settlements.settlement_engine_version IS
  '1 = legacy deposit-only preview; 2 = rent-bucket waterfall engine.';
COMMENT ON COLUMN checkout_settlements.total_refund_paise IS
  'V2 resident refund eligibility = deposit refundable + unused rent credit.';

UPDATE checkout_settlements
SET settlement_engine_version = 1
WHERE settlement_engine_version IS NULL OR settlement_engine_version < 1;
