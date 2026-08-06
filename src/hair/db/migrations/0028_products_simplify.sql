-- Simplify products: Professional vs Retail, remove per-product GST/SKU fields

ALTER TABLE fyh_products
  ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'retail';

UPDATE fyh_products
SET product_type = CASE
  WHEN is_retail = true THEN 'retail'
  WHEN is_consumable = true THEN 'professional'
  ELSE 'retail'
END;

ALTER TABLE fyh_products
  DROP COLUMN IF EXISTS sku,
  DROP COLUMN IF EXISTS barcode,
  DROP COLUMN IF EXISTS reorder_level,
  DROP COLUMN IF EXISTS unit,
  DROP COLUMN IF EXISTS gst_bps,
  DROP COLUMN IF EXISTS is_retail,
  DROP COLUMN IF EXISTS is_consumable;

DROP INDEX IF EXISTS fyh_products_sku_uidx;

ALTER TABLE fyh_products
  DROP CONSTRAINT IF EXISTS fyh_products_type_check;

ALTER TABLE fyh_products
  ADD CONSTRAINT fyh_products_type_check CHECK (product_type IN ('professional', 'retail'));

-- Professional products are internal — clear any legacy selling prices
UPDATE fyh_products SET selling_price_paise = 0 WHERE product_type = 'professional';
