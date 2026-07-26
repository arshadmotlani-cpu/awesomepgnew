-- ADR-019: Three product ledgers — Funding Sources, Seller Payments, Vehicle Costs.
-- Funding SSOT backfill = investor deploys + capital injects.
-- Seller payments / vehicle costs backfill from activities WITHOUT extra deploys
-- (avoids double-counting Active Capital). Legacy funding_entry_id stays NULL.

-- ---------------------------------------------------------------------------
-- 1. Funding Sources
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ac_funding_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_kind text NOT NULL CHECK (entry_kind IN ('inject', 'deploy', 'release', 'transfer')),
  party text NOT NULL CHECK (party IN ('me', 'partner', 'lender')),
  source_kind text NOT NULL CHECK (
    source_kind IN ('bank', 'cash', 'loan', 'partner', 'sale_proceeds')
  ),
  asset_id uuid REFERENCES ac_assets(id) ON DELETE RESTRICT,
  source_asset_id uuid REFERENCES ac_assets(id) ON DELETE RESTRICT,
  amount_paise bigint NOT NULL,
  occurred_at date NOT NULL,
  notes text,
  reference_number text,
  related_entry_id uuid REFERENCES ac_funding_entries(id) ON DELETE SET NULL,
  is_reversed boolean NOT NULL DEFAULT false,
  reversal_of_id uuid,
  ledger_entry_id uuid REFERENCES ac_ledger_entries(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ac_funding_entries_asset_idx
  ON ac_funding_entries (asset_id);
CREATE INDEX IF NOT EXISTS ac_funding_entries_party_idx
  ON ac_funding_entries (party);
CREATE INDEX IF NOT EXISTS ac_funding_entries_kind_idx
  ON ac_funding_entries (entry_kind);
CREATE INDEX IF NOT EXISTS ac_funding_entries_occurred_at_idx
  ON ac_funding_entries (occurred_at);
CREATE INDEX IF NOT EXISTS ac_funding_entries_is_reversed_idx
  ON ac_funding_entries (is_reversed);

-- ---------------------------------------------------------------------------
-- 2. Seller Payments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ac_seller_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES ac_assets(id) ON DELETE RESTRICT,
  amount_paise bigint NOT NULL,
  paid_at date NOT NULL,
  instrument ac_payment_mode NOT NULL,
  kind text NOT NULL CHECK (kind IN ('token', 'purchase', 'final')),
  funding_entry_id uuid REFERENCES ac_funding_entries(id) ON DELETE SET NULL,
  reference_number text,
  notes text,
  activity_id uuid REFERENCES ac_vehicle_activities(id) ON DELETE SET NULL,
  ledger_entry_id uuid REFERENCES ac_ledger_entries(id) ON DELETE SET NULL,
  is_reversed boolean NOT NULL DEFAULT false,
  reversal_of_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ac_seller_payments_asset_idx
  ON ac_seller_payments (asset_id);
CREATE INDEX IF NOT EXISTS ac_seller_payments_paid_at_idx
  ON ac_seller_payments (paid_at);
CREATE INDEX IF NOT EXISTS ac_seller_payments_is_reversed_idx
  ON ac_seller_payments (is_reversed);

-- ---------------------------------------------------------------------------
-- 3. Vehicle Costs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ac_vehicle_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES ac_assets(id) ON DELETE RESTRICT,
  cost_type text NOT NULL CHECK (
    cost_type IN (
      'broker_commission',
      'transport',
      'repair_settlement',
      'fuel',
      'insurance',
      'accessories',
      'washing',
      'service',
      'rto',
      'storage',
      'miscellaneous',
      'refund'
    )
  ),
  amount_paise bigint NOT NULL,
  occurred_at date NOT NULL,
  funding_entry_id uuid REFERENCES ac_funding_entries(id) ON DELETE SET NULL,
  title text,
  notes text,
  activity_id uuid REFERENCES ac_vehicle_activities(id) ON DELETE SET NULL,
  ledger_entry_id uuid REFERENCES ac_ledger_entries(id) ON DELETE SET NULL,
  is_reversed boolean NOT NULL DEFAULT false,
  reversal_of_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ac_vehicle_costs_asset_idx
  ON ac_vehicle_costs (asset_id);
CREATE INDEX IF NOT EXISTS ac_vehicle_costs_occurred_at_idx
  ON ac_vehicle_costs (occurred_at);
CREATE INDEX IF NOT EXISTS ac_vehicle_costs_is_reversed_idx
  ON ac_vehicle_costs (is_reversed);

-- ---------------------------------------------------------------------------
-- 4. Backfill: funding deploys from ac_asset_investors (primary Active Capital SSOT)
-- ---------------------------------------------------------------------------

INSERT INTO ac_funding_entries (
  entry_kind,
  party,
  source_kind,
  asset_id,
  amount_paise,
  occurred_at,
  notes
)
SELECT
  'deploy',
  CASE i.slot
    WHEN 'me' THEN 'me'
    ELSE 'partner'
  END,
  'bank',
  i.asset_id,
  i.invested_paise,
  a.purchase_date,
  'backfill_0012_asset_investor:' || i.id::text
FROM ac_asset_investors i
JOIN ac_assets a ON a.id = i.asset_id
WHERE i.invested_paise > 0
  AND NOT EXISTS (
    SELECT 1
    FROM ac_funding_entries f
    WHERE f.notes = 'backfill_0012_asset_investor:' || i.id::text
  );

-- ---------------------------------------------------------------------------
-- 5. Backfill: funding injects from ac_capital_investments
-- ---------------------------------------------------------------------------

INSERT INTO ac_funding_entries (
  entry_kind,
  party,
  source_kind,
  amount_paise,
  occurred_at,
  reference_number,
  notes,
  is_reversed
)
SELECT
  'inject',
  'me',
  CASE c.payment_mode
    WHEN 'cash' THEN 'cash'
    WHEN 'bank' THEN 'bank'
    WHEN 'neft' THEN 'bank'
    WHEN 'rtgs' THEN 'bank'
    WHEN 'upi' THEN 'bank'
    WHEN 'cheque' THEN 'bank'
    ELSE 'cash'
  END,
  c.amount_paise,
  c.invested_at,
  c.reference_number,
  'backfill_0012_capital_investment:' || c.id::text,
  c.is_reversed
FROM ac_capital_investments c
WHERE NOT EXISTS (
  SELECT 1
  FROM ac_funding_entries f
  WHERE f.notes = 'backfill_0012_capital_investment:' || c.id::text
);

-- ---------------------------------------------------------------------------
-- 6. Backfill: seller payments from payment-milestone activities (no extra deploys)
-- ---------------------------------------------------------------------------

INSERT INTO ac_seller_payments (
  asset_id,
  amount_paise,
  paid_at,
  instrument,
  kind,
  funding_entry_id,
  notes,
  activity_id,
  ledger_entry_id,
  is_reversed
)
SELECT
  v.asset_id,
  COALESCE(v.amount_paise, 0),
  v.activity_at,
  'bank'::ac_payment_mode,
  CASE v.activity_type
    WHEN 'token_paid' THEN 'token'
    WHEN 'purchase_payment' THEN 'purchase'
    WHEN 'final_purchase_payment' THEN 'final'
  END,
  NULL,
  'backfill_0012_activity:' || v.id::text,
  v.id,
  v.ledger_entry_id,
  false
FROM ac_vehicle_activities v
WHERE v.activity_type IN ('token_paid', 'purchase_payment', 'final_purchase_payment')
  AND v.is_reversed = false
  AND COALESCE(v.amount_paise, 0) <> 0
  AND NOT EXISTS (
    SELECT 1
    FROM ac_seller_payments sp
    WHERE sp.activity_id = v.id
  );

-- ---------------------------------------------------------------------------
-- 7. Backfill: vehicle costs from investment-cost activities
-- ---------------------------------------------------------------------------

INSERT INTO ac_vehicle_costs (
  asset_id,
  cost_type,
  amount_paise,
  occurred_at,
  funding_entry_id,
  title,
  notes,
  activity_id,
  ledger_entry_id,
  is_reversed
)
SELECT
  v.asset_id,
  v.activity_type,
  COALESCE(v.amount_paise, 0),
  v.activity_at,
  NULL,
  v.title,
  COALESCE(v.notes, 'backfill_0012_activity:' || v.id::text),
  v.id,
  v.ledger_entry_id,
  false
FROM ac_vehicle_activities v
WHERE v.activity_type IN (
    'broker_commission',
    'transport',
    'repair_settlement',
    'fuel',
    'insurance',
    'accessories',
    'washing',
    'service',
    'rto',
    'storage',
    'miscellaneous'
  )
  AND v.is_reversed = false
  AND v.amount_paise IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM ac_vehicle_costs vc
    WHERE vc.activity_id = v.id
  );
