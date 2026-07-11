-- Profit sharing: per-deal partner vs investor split

DO $$ BEGIN
  CREATE TYPE ac_profit_share_mode AS ENUM ('percentage', 'fixed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE ac_assets
  ADD COLUMN IF NOT EXISTS profit_share_mode ac_profit_share_mode,
  ADD COLUMN IF NOT EXISTS partner_share_pct_bps integer,
  ADD COLUMN IF NOT EXISTS my_share_pct_bps integer,
  ADD COLUMN IF NOT EXISTS partner_share_paise bigint,
  ADD COLUMN IF NOT EXISTS my_share_paise bigint,
  ADD COLUMN IF NOT EXISTS business_roi_bps integer,
  ADD COLUMN IF NOT EXISTS my_roi_bps integer;

ALTER TABLE ac_manual_profits
  ADD COLUMN IF NOT EXISTS profit_share_mode ac_profit_share_mode NOT NULL DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS partner_share_pct_bps integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS my_share_pct_bps integer NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS partner_share_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS my_share_paise bigint;

-- Backfill existing sold/settled assets: 100% to investor (preserve current dashboard totals)
UPDATE ac_assets
SET
  profit_share_mode = 'percentage',
  partner_share_pct_bps = 0,
  my_share_pct_bps = 10000,
  partner_share_paise = 0,
  my_share_paise = COALESCE(profit_paise, 0),
  business_roi_bps = roi_bps,
  my_roi_bps = roi_bps
WHERE profit_paise IS NOT NULL
  AND my_share_paise IS NULL;

-- Backfill manual profits: amount is gross; my share = full amount
UPDATE ac_manual_profits
SET my_share_paise = amount_paise
WHERE my_share_paise IS NULL;

ALTER TABLE ac_manual_profits
  ALTER COLUMN my_share_paise SET NOT NULL;
