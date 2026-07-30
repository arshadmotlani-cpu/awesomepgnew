-- Phase A inventory ops: vendors, POs, GRNs, adjustments, batches

ALTER TABLE fyh_settings
  ADD COLUMN IF NOT EXISTS inventory_settings jsonb NOT NULL DEFAULT '{"allowNegativeStock": false}'::jsonb;

CREATE TABLE IF NOT EXISTS fyh_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  gstin text,
  address text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fyh_vendors_name_idx ON fyh_vendors (name);
CREATE INDEX IF NOT EXISTS fyh_vendors_active_idx ON fyh_vendors (is_active);

CREATE TABLE IF NOT EXISTS fyh_purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES fyh_vendors (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ordered', 'received', 'cancelled')),
  po_number text NOT NULL,
  ordered_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fyh_purchase_orders_po_number_idx ON fyh_purchase_orders (po_number);
CREATE INDEX IF NOT EXISTS fyh_purchase_orders_vendor_idx ON fyh_purchase_orders (vendor_id);
CREATE INDEX IF NOT EXISTS fyh_purchase_orders_status_idx ON fyh_purchase_orders (status);

CREATE TABLE IF NOT EXISTS fyh_purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES fyh_purchase_orders (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES fyh_products (id) ON DELETE RESTRICT,
  quantity_ordered numeric(12, 3) NOT NULL CHECK (quantity_ordered > 0),
  unit_cost_paise bigint NOT NULL DEFAULT 0 CHECK (unit_cost_paise >= 0)
);

CREATE INDEX IF NOT EXISTS fyh_purchase_order_lines_po_idx ON fyh_purchase_order_lines (purchase_order_id);
CREATE INDEX IF NOT EXISTS fyh_purchase_order_lines_product_idx ON fyh_purchase_order_lines (product_id);

CREATE TABLE IF NOT EXISTS fyh_goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid REFERENCES fyh_purchase_orders (id) ON DELETE SET NULL,
  vendor_id uuid NOT NULL REFERENCES fyh_vendors (id) ON DELETE RESTRICT,
  received_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fyh_goods_receipts_po_idx ON fyh_goods_receipts (purchase_order_id);
CREATE INDEX IF NOT EXISTS fyh_goods_receipts_vendor_idx ON fyh_goods_receipts (vendor_id);

CREATE TABLE IF NOT EXISTS fyh_goods_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id uuid NOT NULL REFERENCES fyh_goods_receipts (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES fyh_products (id) ON DELETE RESTRICT,
  quantity_received numeric(12, 3) NOT NULL CHECK (quantity_received > 0),
  unit_cost_paise bigint NOT NULL DEFAULT 0 CHECK (unit_cost_paise >= 0),
  batch_number text,
  expiry_date date
);

CREATE INDEX IF NOT EXISTS fyh_goods_receipt_lines_grn_idx ON fyh_goods_receipt_lines (goods_receipt_id);
CREATE INDEX IF NOT EXISTS fyh_goods_receipt_lines_product_idx ON fyh_goods_receipt_lines (product_id);

CREATE TABLE IF NOT EXISTS fyh_stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES fyh_products (id) ON DELETE RESTRICT,
  quantity_delta numeric(12, 3) NOT NULL CHECK (quantity_delta <> 0),
  reason text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fyh_stock_adjustments_product_idx ON fyh_stock_adjustments (product_id, created_at);

CREATE TABLE IF NOT EXISTS fyh_product_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES fyh_products (id) ON DELETE RESTRICT,
  batch_number text NOT NULL,
  expiry_date date,
  qty_on_hand numeric(12, 3) NOT NULL DEFAULT 0,
  cost_price_paise bigint NOT NULL DEFAULT 0 CHECK (cost_price_paise >= 0)
);

CREATE INDEX IF NOT EXISTS fyh_product_batches_product_idx ON fyh_product_batches (product_id);
