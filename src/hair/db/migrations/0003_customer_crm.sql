-- Customer CRM profile upgrade + notes + timeline

ALTER TABLE fyh_customers
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS pincode text,
  ADD COLUMN IF NOT EXISTS occupation text,
  ADD COLUMN IF NOT EXISTS anniversary date,
  ADD COLUMN IF NOT EXISTS hair_type text,
  ADD COLUMN IF NOT EXISTS skin_type text,
  ADD COLUMN IF NOT EXISTS allergies text,
  ADD COLUMN IF NOT EXISTS preferred_stylist text,
  ADD COLUMN IF NOT EXISTS referred_by text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS important_alerts text,
  ADD COLUMN IF NOT EXISTS first_visit_at date,
  ADD COLUMN IF NOT EXISTS last_visit_at date,
  ADD COLUMN IF NOT EXISTS total_visits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_spend_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS average_bill_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_service text,
  ADD COLUMN IF NOT EXISTS favourite_service text,
  ADD COLUMN IF NOT EXISTS favourite_stylist text,
  ADD COLUMN IF NOT EXISTS membership text,
  ADD COLUMN IF NOT EXISTS wallet_balance_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS packages_purchased integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gift_cards_count integer NOT NULL DEFAULT 0;

-- Keep legacy `notes` as internal notes; already present from 0002.

CREATE INDEX IF NOT EXISTS fyh_customers_whatsapp_idx ON fyh_customers (whatsapp);
CREATE INDEX IF NOT EXISTS fyh_customers_email_idx ON fyh_customers (email);

CREATE TABLE IF NOT EXISTS fyh_customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES fyh_customers(id) ON DELETE CASCADE,
  body text NOT NULL,
  is_alert boolean NOT NULL DEFAULT false,
  created_by_admin_id uuid REFERENCES fyh_admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fyh_customer_notes_customer_idx
  ON fyh_customer_notes (customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fyh_customer_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES fyh_customers(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  title text NOT NULL,
  body text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fyh_customer_timeline_type_check CHECK (
    event_type IN (
      'customer_created',
      'appointment',
      'bill',
      'membership',
      'package',
      'note',
      'wallet',
      'profile_updated',
      'other'
    )
  )
);

CREATE INDEX IF NOT EXISTS fyh_customer_timeline_customer_idx
  ON fyh_customer_timeline (customer_id, occurred_at DESC);

COMMENT ON COLUMN fyh_customers.important_alerts IS 'Shown prominently during billing';
COMMENT ON COLUMN fyh_customers.notes IS 'Internal staff notes';
