-- Investment budget model (Capital Reset Rebuild).
-- Expected Total Investment + Seller Price + Current Investment / Budget Remaining.
-- Free-text costs use title; entry_kind cost|refund.

ALTER TABLE ac_assets
  ADD COLUMN IF NOT EXISTS expected_total_investment_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_price_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_investment_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS budget_remaining_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buyer_name text;

-- Backfill from legacy purchase price where present (pre-wipe safety).
UPDATE ac_assets
SET
  seller_price_paise = COALESCE(NULLIF(seller_price_paise, 0), purchase_price_paise, 0),
  expected_total_investment_paise = COALESCE(
    NULLIF(expected_total_investment_paise, 0),
    total_investment_paise,
    purchase_price_paise,
    0
  ),
  current_investment_paise = COALESCE(NULLIF(current_investment_paise, 0), total_investment_paise, 0),
  budget_remaining_paise = COALESCE(
    expected_total_investment_paise,
    total_investment_paise,
    purchase_price_paise,
    0
  ) - COALESCE(NULLIF(current_investment_paise, 0), total_investment_paise, 0)
WHERE true;

ALTER TABLE ac_vehicle_costs
  ADD COLUMN IF NOT EXISTS entry_kind text NOT NULL DEFAULT 'cost';

UPDATE ac_vehicle_costs
SET entry_kind = 'refund'
WHERE entry_kind = 'cost' AND (cost_type = 'refund' OR amount_paise < 0);

COMMENT ON COLUMN ac_assets.expected_total_investment_paise IS 'Editable target budget for the vehicle';
COMMENT ON COLUMN ac_assets.seller_price_paise IS 'Negotiated price with seller';
COMMENT ON COLUMN ac_assets.current_investment_paise IS 'Seller Price + costs - refunds (SSOT cache)';
COMMENT ON COLUMN ac_assets.budget_remaining_paise IS 'Expected - Current Investment (SSOT cache)';
