-- Asset class taxonomy + movable asset extension tables

DO $$ BEGIN
  CREATE TYPE oo_asset_class AS ENUM ('FIXED', 'MOVABLE', 'FINANCIAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE oo_assets
  ADD COLUMN IF NOT EXISTS asset_class oo_asset_class NOT NULL DEFAULT 'FIXED';

UPDATE oo_assets SET asset_class = 'FIXED' WHERE asset_type = 'PROPERTY';

CREATE TABLE IF NOT EXISTS oo_movable_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL UNIQUE REFERENCES oo_assets(id) ON DELETE CASCADE,
  movable_type text NOT NULL DEFAULT 'vehicle',
  make text,
  model text,
  purchase_date date,
  purchase_price_paise bigint NOT NULL DEFAULT 0,
  rate_method text NOT NULL DEFAULT 'FLAT_ANNUAL',
  annual_rate_bps integer NOT NULL DEFAULT 0,
  is_depreciation boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oo_movable_valuations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES oo_assets(id) ON DELETE CASCADE,
  valuation_date date NOT NULL,
  value_paise bigint NOT NULL,
  kind oo_valuation_kind NOT NULL DEFAULT 'MARKET_ESTIMATE',
  notes text,
  created_by uuid REFERENCES oo_admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oo_movable_valuations_asset_idx ON oo_movable_valuations(asset_id, valuation_date DESC);
