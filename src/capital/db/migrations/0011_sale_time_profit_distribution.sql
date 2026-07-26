-- Profit Distribution is a SALE property, not a purchase property.
-- Unsold vehicles have NULL mode; mode is chosen when recording the sale (default SELF in UI).

ALTER TABLE ac_assets
  ALTER COLUMN profit_distribution_mode DROP NOT NULL;

ALTER TABLE ac_assets
  ALTER COLUMN profit_distribution_mode DROP DEFAULT;

-- Clear create-time guesses on vehicles that have not been sold yet.
UPDATE ac_assets
SET profit_distribution_mode = NULL
WHERE actual_sale_price_paise IS NULL
  AND status NOT IN ('sold', 'settled');

COMMENT ON COLUMN ac_assets.profit_distribution_mode IS
  'Sale-time My vs Sufii split (SELF | PARTNERSHIP_50_50). NULL until sale is recorded.';
