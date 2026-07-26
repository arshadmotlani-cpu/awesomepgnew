-- Profit Distribution Mode SSOT (SELF | PARTNERSHIP_50_50)
-- Existing vehicles → PARTNERSHIP_50_50 (matches prior Settings 50/50 assumption)
-- New vehicles default SELF

DO $$ BEGIN
  CREATE TYPE ac_profit_distribution_mode AS ENUM ('SELF', 'PARTNERSHIP_50_50');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE ac_assets
  ADD COLUMN IF NOT EXISTS profit_distribution_mode ac_profit_distribution_mode;

UPDATE ac_assets
SET profit_distribution_mode = 'PARTNERSHIP_50_50'
WHERE profit_distribution_mode IS NULL;

ALTER TABLE ac_assets
  ALTER COLUMN profit_distribution_mode SET DEFAULT 'SELF';

ALTER TABLE ac_assets
  ALTER COLUMN profit_distribution_mode SET NOT NULL;
