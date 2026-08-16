-- Property enrichment: location, income baseline, appreciation method, cost breakdown

ALTER TABLE oo_properties
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS appreciation_method text NOT NULL DEFAULT 'FLAT_ANNUAL',
  ADD COLUMN IF NOT EXISTS purchase_costs_breakdown_json jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS monthly_rental_income_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_monthly_income_paise bigint NOT NULL DEFAULT 0;
