-- Vehicle Investment OS: typed activities timeline + repair advances + cover photos

CREATE TABLE IF NOT EXISTS ac_vehicle_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES ac_assets(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  activity_at date NOT NULL,
  amount_paise bigint,
  title text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  document_id uuid REFERENCES ac_documents(id) ON DELETE SET NULL,
  ledger_entry_id uuid REFERENCES ac_ledger_entries(id) ON DELETE SET NULL,
  repair_advance_id uuid,
  is_reversed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ac_vehicle_activities_asset_at_idx
  ON ac_vehicle_activities (asset_id, activity_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS ac_vehicle_activities_type_idx
  ON ac_vehicle_activities (activity_type);
CREATE INDEX IF NOT EXISTS ac_vehicle_activities_asset_open_idx
  ON ac_vehicle_activities (asset_id) WHERE is_reversed = false;

CREATE TABLE IF NOT EXISTS ac_repair_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES ac_assets(id) ON DELETE CASCADE,
  advance_paise bigint NOT NULL CHECK (advance_paise > 0),
  actual_cost_paise bigint,
  returned_paise bigint NOT NULL DEFAULT 0 CHECK (returned_paise >= 0),
  outstanding_paise bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled')),
  advance_activity_id uuid REFERENCES ac_vehicle_activities(id) ON DELETE SET NULL,
  settlement_activity_id uuid REFERENCES ac_vehicle_activities(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ac_repair_advances_asset_idx ON ac_repair_advances (asset_id);
CREATE INDEX IF NOT EXISTS ac_repair_advances_status_idx ON ac_repair_advances (status);

ALTER TABLE ac_vehicle_activities
  DROP CONSTRAINT IF EXISTS ac_vehicle_activities_repair_advance_id_fkey;
ALTER TABLE ac_vehicle_activities
  ADD CONSTRAINT ac_vehicle_activities_repair_advance_id_fkey
  FOREIGN KEY (repair_advance_id) REFERENCES ac_repair_advances(id) ON DELETE SET NULL;

ALTER TABLE ac_documents
  ADD COLUMN IF NOT EXISTS is_cover boolean NOT NULL DEFAULT false;

ALTER TABLE ac_assets
  ADD COLUMN IF NOT EXISTS cover_document_id uuid REFERENCES ac_documents(id) ON DELETE SET NULL;

-- Backfill: vehicle_created for every asset
INSERT INTO ac_vehicle_activities (asset_id, activity_type, activity_at, title, notes, metadata)
SELECT
  a.id,
  'vehicle_created',
  a.purchase_date,
  'Vehicle Created',
  a.display_name,
  jsonb_build_object('source', 'backfill_0009')
FROM ac_assets a
WHERE NOT EXISTS (
  SELECT 1 FROM ac_vehicle_activities v
  WHERE v.asset_id = a.id AND v.activity_type = 'vehicle_created' AND v.is_reversed = false
);

-- Backfill: purchase_payment equal to purchase price (historical cost base)
INSERT INTO ac_vehicle_activities (asset_id, activity_type, activity_at, amount_paise, title, notes, metadata)
SELECT
  a.id,
  'purchase_payment',
  a.purchase_date,
  a.purchase_price_paise,
  'Purchase Payment (backfill)',
  'Migrated from asset purchase price',
  jsonb_build_object('source', 'backfill_0009_purchase')
FROM ac_assets a
WHERE a.purchase_price_paise > 0
  AND NOT EXISTS (
    SELECT 1 FROM ac_vehicle_activities v
    WHERE v.asset_id = a.id
      AND v.activity_type IN ('purchase_payment', 'token_paid')
      AND v.is_reversed = false
      AND v.metadata->>'source' = 'backfill_0009_purchase'
  );

-- Backfill expenses → activities
INSERT INTO ac_vehicle_activities (
  asset_id, activity_type, activity_at, amount_paise, title, notes, metadata
)
SELECT
  e.asset_id,
  CASE c.slug
    WHEN 'purchase' THEN 'purchase_payment'
    WHEN 'broker' THEN 'broker_commission'
    WHEN 'transport' THEN 'transport'
    WHEN 'fuel' THEN 'fuel'
    WHEN 'insurance' THEN 'insurance'
    WHEN 'accessories' THEN 'accessories'
    WHEN 'cleaning' THEN 'washing'
    WHEN 'engine' THEN 'service'
    WHEN 'painting' THEN 'repair_settlement'
    WHEN 'denting' THEN 'repair_settlement'
    WHEN 'repair' THEN 'repair_settlement'
    ELSE 'miscellaneous'
  END,
  e.expense_date,
  e.amount_paise,
  COALESCE(NULLIF(e.description, ''), c.label),
  e.notes,
  jsonb_build_object(
    'source', 'backfill_0009_expense',
    'expenseId', e.id,
    'categorySlug', c.slug
  )
FROM ac_expenses e
INNER JOIN ac_categories c ON c.id = e.category_id
WHERE e.is_reversed = false
  AND c.slug <> 'purchase'
  AND NOT EXISTS (
    SELECT 1 FROM ac_vehicle_activities v
    WHERE v.metadata->>'expenseId' = e.id::text
  );
