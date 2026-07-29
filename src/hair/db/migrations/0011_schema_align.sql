-- Align fyh_staff + fyh_products with Drizzle schemas

ALTER TABLE fyh_staff
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS joining_date date,
  ADD COLUMN IF NOT EXISTS performance_target_paise bigint NOT NULL DEFAULT 0;

ALTER TABLE fyh_products
  ADD COLUMN IF NOT EXISTS supplier text,
  ADD COLUMN IF NOT EXISTS batch_number text,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS opening_stock numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_stock numeric(12, 2) NOT NULL DEFAULT 0;
