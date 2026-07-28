-- Products module expansion

ALTER TABLE fyh_products
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS reorder_level numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_bps integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_retail boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_consumable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS fyh_products_category_idx ON fyh_products (category);
CREATE INDEX IF NOT EXISTS fyh_products_brand_idx ON fyh_products (brand);

COMMENT ON TABLE fyh_products IS 'Salon retail + consumable products — feeds inventory, billing, and service kits';
