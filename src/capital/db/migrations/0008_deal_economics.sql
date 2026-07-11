-- Deal economics: Net Vehicle Cost breakdown, funding gap, operating partner + investor pool
ALTER TABLE ac_assets
  ADD COLUMN IF NOT EXISTS repair_total_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dealer_refund_total_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS funding_gap_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS my_investment_pct_bps integer,
  ADD COLUMN IF NOT EXISTS operating_partner_profit_paise bigint,
  ADD COLUMN IF NOT EXISTS investor_profit_pool_paise bigint;

COMMENT ON COLUMN ac_assets.total_investment_paise IS 'Net Vehicle Cost = purchase + repairs - refunds/credits';
COMMENT ON COLUMN ac_assets.partner_share_paise IS 'Operating partner (Sufii) profit share of business profit';
COMMENT ON COLUMN ac_assets.funding_gap_paise IS 'Net vehicle cost minus sum of capital investor stakes; 0 = fully funded';
