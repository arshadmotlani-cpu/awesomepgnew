-- Additional Income ledger (separate from Vehicle Costs / TVI).
-- Vehicle Profit = Sale − TVI + Σ Additional Income.

CREATE TABLE IF NOT EXISTS ac_vehicle_additional_income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES ac_assets(id) ON DELETE RESTRICT,
  income_type text NOT NULL,
  amount_paise bigint NOT NULL,
  occurred_at date NOT NULL,
  notes text,
  is_reversed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ac_vehicle_additional_income_amount_positive CHECK (amount_paise > 0),
  CONSTRAINT ac_vehicle_additional_income_type_check CHECK (
    income_type IN (
      'brokerage',
      'finance_commission',
      'insurance_commission',
      'rto_commission',
      'referral_income',
      'dealer_incentive',
      'miscellaneous'
    )
  )
);

CREATE INDEX IF NOT EXISTS ac_vehicle_additional_income_asset_idx
  ON ac_vehicle_additional_income (asset_id);
CREATE INDEX IF NOT EXISTS ac_vehicle_additional_income_occurred_at_idx
  ON ac_vehicle_additional_income (occurred_at);

ALTER TABLE ac_assets
  ADD COLUMN IF NOT EXISTS total_additional_income_paise bigint NOT NULL DEFAULT 0;

COMMENT ON TABLE ac_vehicle_additional_income IS
  'Earnings outside TVI — brokerage, commissions, incentives. Does not change Active Capital.';
COMMENT ON COLUMN ac_assets.total_additional_income_paise IS
  'Cached Σ non-reversed additional income (SSOT for list/report speed)';
