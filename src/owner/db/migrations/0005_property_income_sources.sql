-- Property income sources + rent history; migrate legacy monthly fields

DO $$ BEGIN
  CREATE TYPE oo_property_income_source_type AS ENUM (
    'PG', 'SHOP', 'OFFICE', 'RESIDENTIAL_RENT', 'COMMERCIAL_RENT', 'PARKING', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE oo_property_income_source_status AS ENUM ('ACTIVE', 'VACANT', 'INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS oo_property_income_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES oo_assets(id) ON DELETE CASCADE,
  source_type oo_property_income_source_type NOT NULL,
  name text NOT NULL,
  tenant_name text,
  monthly_amount_paise bigint NOT NULL DEFAULT 0,
  security_deposit_paise bigint NOT NULL DEFAULT 0,
  start_date date,
  end_date date,
  status oo_property_income_source_status NOT NULL DEFAULT 'ACTIVE',
  source_system oo_source_system,
  source_reference_id text,
  linked_pg_id uuid,
  notes text,
  created_by uuid REFERENCES oo_admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oo_property_income_sources_asset_idx ON oo_property_income_sources(asset_id);
CREATE INDEX IF NOT EXISTS oo_property_income_sources_status_idx ON oo_property_income_sources(status);

CREATE TABLE IF NOT EXISTS oo_property_income_rent_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  income_source_id uuid NOT NULL REFERENCES oo_property_income_sources(id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  effective_to date,
  monthly_amount_paise bigint NOT NULL,
  notes text,
  created_by uuid REFERENCES oo_admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oo_property_income_rent_history_source_idx
  ON oo_property_income_rent_history(income_source_id, effective_from);

-- Migrate legacy monthly_rental_income_paise / other_monthly_income_paise into income sources (once)
INSERT INTO oo_property_income_sources (
  asset_id, source_type, name, monthly_amount_paise, status, source_system, linked_pg_id, start_date
)
SELECT
  p.asset_id,
  'PG'::oo_property_income_source_type,
  'Awesome PG',
  p.monthly_rental_income_paise,
  'ACTIVE'::oo_property_income_source_status,
  CASE WHEN p.linked_pg_id IS NOT NULL THEN 'AWESOME_PG'::oo_source_system ELSE NULL END,
  p.linked_pg_id,
  p.purchase_date
FROM oo_properties p
WHERE p.monthly_rental_income_paise > 0
  AND NOT EXISTS (
    SELECT 1 FROM oo_property_income_sources s
    WHERE s.asset_id = p.asset_id AND s.source_type = 'PG'
  );

INSERT INTO oo_property_income_sources (
  asset_id, source_type, name, monthly_amount_paise, status, start_date
)
SELECT
  p.asset_id,
  'OTHER'::oo_property_income_source_type,
  'Other income',
  p.other_monthly_income_paise,
  'ACTIVE'::oo_property_income_source_status,
  p.purchase_date
FROM oo_properties p
WHERE p.other_monthly_income_paise > 0
  AND NOT EXISTS (
    SELECT 1 FROM oo_property_income_sources s
    WHERE s.asset_id = p.asset_id AND s.source_type = 'OTHER' AND s.name = 'Other income'
  );

-- Rent history seed for migrated sources
INSERT INTO oo_property_income_rent_history (income_source_id, effective_from, monthly_amount_paise, notes)
SELECT s.id, COALESCE(s.start_date, CURRENT_DATE), s.monthly_amount_paise, 'Migrated from legacy property income fields'
FROM oo_property_income_sources s
WHERE NOT EXISTS (
  SELECT 1 FROM oo_property_income_rent_history h WHERE h.income_source_id = s.id
);

-- PG-linked properties: create PG source row if linked but no rental migrated
INSERT INTO oo_property_income_sources (
  asset_id, source_type, name, monthly_amount_paise, status, source_system, linked_pg_id, start_date
)
SELECT
  p.asset_id,
  'PG'::oo_property_income_source_type,
  'Awesome PG',
  0,
  'ACTIVE'::oo_property_income_source_status,
  'AWESOME_PG'::oo_source_system,
  p.linked_pg_id,
  p.purchase_date
FROM oo_properties p
WHERE p.linked_pg_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM oo_property_income_sources s
    WHERE s.asset_id = p.asset_id AND s.source_type = 'PG'
  );
