-- Customers foundation for For Your Hair ERP

CREATE TABLE IF NOT EXISTS fyh_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text NOT NULL,
  email text,
  gender text,
  date_of_birth date,
  notes text,
  source text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fyh_customers_gender_check CHECK (
    gender IS NULL OR gender IN ('female', 'male', 'other', 'prefer_not_to_say')
  ),
  CONSTRAINT fyh_customers_source_check CHECK (
    source IS NULL OR source IN ('walk_in', 'referral', 'instagram', 'whatsapp', 'other')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS fyh_customers_phone_active_uidx
  ON fyh_customers (phone)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS fyh_customers_phone_idx ON fyh_customers (phone);
CREATE INDEX IF NOT EXISTS fyh_customers_name_idx ON fyh_customers (full_name);
CREATE INDEX IF NOT EXISTS fyh_customers_active_idx ON fyh_customers (is_active);

COMMENT ON TABLE fyh_customers IS 'Salon customers — foundation for appointments, billing, and loyalty';
