-- ERP foundation: brands, expenses, floor issues, vendor extensions

CREATE TABLE IF NOT EXISTS fyh_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  vendor_id uuid REFERENCES fyh_vendors(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fyh_brands_vendor_idx ON fyh_brands (vendor_id);

ALTER TABLE fyh_vendors
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS bank_details text,
  ADD COLUMN IF NOT EXISTS upi_id text,
  ADD COLUMN IF NOT EXISTS qr_code_url text;

ALTER TABLE fyh_products
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES fyh_brands(id) ON DELETE RESTRICT;

INSERT INTO fyh_brands (name)
SELECT DISTINCT TRIM(brand)
FROM fyh_products
WHERE brand IS NOT NULL AND TRIM(brand) <> ''
ON CONFLICT (name) DO NOTHING;

UPDATE fyh_products p
SET brand_id = b.id
FROM fyh_brands b
WHERE p.brand_id IS NULL
  AND p.brand IS NOT NULL
  AND TRIM(p.brand) = b.name;

INSERT INTO fyh_brands (name) VALUES ('Unbranded') ON CONFLICT (name) DO NOTHING;

UPDATE fyh_products
SET brand_id = (SELECT id FROM fyh_brands WHERE name = 'Unbranded' LIMIT 1)
WHERE brand_id IS NULL;

ALTER TABLE fyh_products DROP COLUMN IF EXISTS brand;

ALTER TABLE fyh_products ALTER COLUMN brand_id SET NOT NULL;

CREATE TABLE IF NOT EXISTS fyh_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  expense_date date NOT NULL,
  amount_paise bigint NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash',
  attachment_url text,
  notes text,
  staff_name text NOT NULL,
  staff_employee_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fyh_expenses_date_idx ON fyh_expenses (expense_date DESC);
CREATE INDEX IF NOT EXISTS fyh_expenses_category_idx ON fyh_expenses (category);

CREATE TABLE IF NOT EXISTS fyh_floor_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES fyh_products(id) ON DELETE RESTRICT,
  quantity numeric(12, 2) NOT NULL DEFAULT 0,
  issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by_name text NOT NULL,
  issued_by_employee_id uuid,
  returned_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fyh_floor_issues_product_idx ON fyh_floor_issues (product_id);
CREATE INDEX IF NOT EXISTS fyh_floor_issues_open_idx ON fyh_floor_issues (returned_at);
