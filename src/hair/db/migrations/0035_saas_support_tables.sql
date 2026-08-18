-- Phase 0B: SaaS support tables (per-org sequences, staff locations, location stock)

CREATE TABLE IF NOT EXISTS fyh_org_invoice_sequences (
  organization_id uuid PRIMARY KEY,
  prefix text NOT NULL DEFAULT 'INV',
  next_seq integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fyh_org_customer_sequences (
  organization_id uuid PRIMARY KEY,
  next_seq integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fyh_staff_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  staff_id uuid NOT NULL REFERENCES fyh_staff (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  location_id uuid NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fyh_staff_locations_staff_location_uidx
  ON fyh_staff_locations (staff_id, location_id);
CREATE INDEX IF NOT EXISTS fyh_staff_locations_org_idx ON fyh_staff_locations (organization_id);
CREATE INDEX IF NOT EXISTS fyh_staff_locations_location_idx ON fyh_staff_locations (location_id);

CREATE TABLE IF NOT EXISTS fyh_location_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES fyh_products (id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fyh_location_stock_org_loc_product_uidx
  ON fyh_location_stock (organization_id, location_id, product_id);
CREATE INDEX IF NOT EXISTS fyh_location_stock_org_idx ON fyh_location_stock (organization_id);
CREATE INDEX IF NOT EXISTS fyh_location_stock_location_idx ON fyh_location_stock (location_id);
