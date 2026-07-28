-- Production Services upgrade + categories + staff + products foundation + consumables

CREATE TABLE IF NOT EXISTS fyh_service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  is_system boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO fyh_service_categories (name, slug, is_system, display_order) VALUES
  ('Hair', 'hair', true, 10),
  ('Hair Color', 'hair-color', true, 20),
  ('Hair Treatment', 'hair-treatment', true, 30),
  ('Skin', 'skin', true, 40),
  ('Makeup', 'makeup', true, 50),
  ('Bridal', 'bridal', true, 60),
  ('Nails', 'nails', true, 70),
  ('Spa', 'spa', true, 80),
  ('Barber', 'barber', true, 90),
  ('Other', 'other', true, 100)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS fyh_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text,
  role text,
  is_active boolean NOT NULL DEFAULT true,
  default_commission_type text NOT NULL DEFAULT 'none',
  default_commission_fixed_paise bigint NOT NULL DEFAULT 0,
  default_commission_percent_bps integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fyh_staff_commission_type_check CHECK (
    default_commission_type IN ('none', 'fixed', 'percentage')
  )
);

CREATE INDEX IF NOT EXISTS fyh_staff_active_idx ON fyh_staff (is_active);
CREATE INDEX IF NOT EXISTS fyh_staff_name_idx ON fyh_staff (full_name);

-- Products foundation (expanded in Products module)
CREATE TABLE IF NOT EXISTS fyh_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text,
  category text,
  selling_price_paise bigint NOT NULL DEFAULT 0,
  cost_price_paise bigint NOT NULL DEFAULT 0,
  stock_qty numeric(12, 2) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'unit',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fyh_products_name_idx ON fyh_products (name);
CREATE INDEX IF NOT EXISTS fyh_products_active_idx ON fyh_products (is_active);
CREATE UNIQUE INDEX IF NOT EXISTS fyh_products_sku_uidx ON fyh_products (sku) WHERE sku IS NOT NULL;

ALTER TABLE fyh_services
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS cost_price_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_bps integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS commission_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS commission_fixed_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_percent_bps integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS override_staff_commission boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS available_online boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_on_website boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS total_bookings integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue_generated_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_booked_at timestamptz,
  ADD COLUMN IF NOT EXISTS average_duration_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Backfill codes for existing rows
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
  FROM fyh_services
  WHERE code IS NULL
)
UPDATE fyh_services s
SET code = 'SVC-' || lpad(numbered.n::text, 4, '0')
FROM numbered
WHERE s.id = numbered.id;

CREATE UNIQUE INDEX IF NOT EXISTS fyh_services_code_uidx ON fyh_services (code);
CREATE INDEX IF NOT EXISTS fyh_services_display_order_idx ON fyh_services (display_order, name);

DO $$ BEGIN
  ALTER TABLE fyh_services
    ADD CONSTRAINT fyh_services_commission_type_check
    CHECK (commission_type IN ('none', 'fixed', 'percentage'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS fyh_service_staff (
  service_id uuid NOT NULL REFERENCES fyh_services(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES fyh_staff(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, staff_id)
);

CREATE TABLE IF NOT EXISTS fyh_service_consumables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES fyh_services(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES fyh_products(id) ON DELETE RESTRICT,
  quantity numeric(12, 3) NOT NULL DEFAULT 1,
  deduct_inventory boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fyh_service_consumables_qty_positive CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS fyh_service_consumables_service_idx
  ON fyh_service_consumables (service_id);

CREATE SEQUENCE IF NOT EXISTS fyh_service_code_seq;

DO $$
DECLARE
  max_n integer;
BEGIN
  SELECT COALESCE(
    MAX(NULLIF(regexp_replace(code, '\D', '', 'g'), '')::int),
    0
  )
  INTO max_n
  FROM fyh_services;

  IF max_n < 1 THEN
    PERFORM setval('fyh_service_code_seq', 1, false);
  ELSE
    PERFORM setval('fyh_service_code_seq', max_n, true);
  END IF;
END $$;

COMMENT ON COLUMN fyh_services.is_active IS 'When false (archived), blocked from new appointments; retained for historical invoices';
COMMENT ON COLUMN fyh_service_consumables.deduct_inventory IS 'Inventory deduction disabled until Inventory module is live';
