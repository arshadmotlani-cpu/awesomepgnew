-- Salon services catalog

CREATE TABLE IF NOT EXISTS fyh_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text,
  duration_minutes integer NOT NULL DEFAULT 30,
  price_paise bigint NOT NULL DEFAULT 0,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fyh_services_duration_positive CHECK (duration_minutes > 0),
  CONSTRAINT fyh_services_price_nonneg CHECK (price_paise >= 0)
);

CREATE INDEX IF NOT EXISTS fyh_services_name_idx ON fyh_services (name);
CREATE INDEX IF NOT EXISTS fyh_services_active_idx ON fyh_services (is_active);
CREATE INDEX IF NOT EXISTS fyh_services_category_idx ON fyh_services (category);

COMMENT ON TABLE fyh_services IS 'Salon service menu — foundation for appointments and billing';
