-- Loyalty ops: memberships, packages, bridal, notification outbox
-- Matches Drizzle schemas in loyalty.ts + notifications.ts

CREATE TABLE IF NOT EXISTS fyh_membership_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tier text NOT NULL,
  discount_bps integer NOT NULL DEFAULT 0,
  priority_booking boolean NOT NULL DEFAULT false,
  birthday_benefit text,
  anniversary_offer text,
  reward_multiplier_bps integer NOT NULL DEFAULT 10000,
  validity_days integer NOT NULL DEFAULT 365,
  price_paise bigint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fyh_membership_plans_tier_check CHECK (
    tier IN ('silver', 'gold', 'platinum', 'vip')
  )
);

CREATE INDEX IF NOT EXISTS fyh_membership_plans_active_idx
  ON fyh_membership_plans (is_active);

CREATE TABLE IF NOT EXISTS fyh_customer_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES fyh_customers(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES fyh_membership_plans(id) ON DELETE RESTRICT,
  starts_on date NOT NULL,
  expires_on date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fyh_customer_memberships_customer_idx
  ON fyh_customer_memberships (customer_id, is_active);

CREATE TABLE IF NOT EXISTS fyh_package_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  service_id uuid REFERENCES fyh_services(id) ON DELETE SET NULL,
  total_sessions integer NOT NULL DEFAULT 1,
  price_paise bigint NOT NULL DEFAULT 0,
  validity_days integer NOT NULL DEFAULT 90,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fyh_package_plans_active_idx
  ON fyh_package_plans (is_active);

CREATE TABLE IF NOT EXISTS fyh_customer_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES fyh_customers(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES fyh_package_plans(id) ON DELETE RESTRICT,
  total_sessions integer NOT NULL,
  used_sessions integer NOT NULL DEFAULT 0,
  expires_on date,
  is_frozen boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fyh_customer_packages_customer_idx
  ON fyh_customer_packages (customer_id, is_active);

CREATE TABLE IF NOT EXISTS fyh_bridal_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES fyh_customers(id) ON DELETE CASCADE,
  bride_name text NOT NULL,
  wedding_date date,
  notes text,
  outstanding_paise bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fyh_bridal_profiles_customer_idx
  ON fyh_bridal_profiles (customer_id);

CREATE TABLE IF NOT EXISTS fyh_bridal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bridal_profile_id uuid NOT NULL REFERENCES fyh_bridal_profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_date date,
  notes text,
  amount_paise bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fyh_bridal_events_type_check CHECK (
    event_type IN ('trial', 'engagement', 'haldi', 'mehendi', 'sangeet', 'wedding', 'reception')
  )
);

CREATE INDEX IF NOT EXISTS fyh_bridal_events_profile_idx
  ON fyh_bridal_events (bridal_profile_id);

CREATE TABLE IF NOT EXISTS fyh_notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL UNIQUE,
  channel text NOT NULL DEFAULT 'whatsapp',
  subject text,
  body text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fyh_notification_templates_kind_idx
  ON fyh_notification_templates (kind);

CREATE TABLE IF NOT EXISTS fyh_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  recipient text NOT NULL,
  subject text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  error text,
  metadata text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fyh_notification_outbox_status_check CHECK (
    status IN ('pending', 'sent', 'failed')
  )
);

CREATE INDEX IF NOT EXISTS fyh_notification_outbox_status_idx
  ON fyh_notification_outbox (status, scheduled_for);
CREATE INDEX IF NOT EXISTS fyh_notification_outbox_kind_idx
  ON fyh_notification_outbox (kind);

COMMENT ON TABLE fyh_membership_plans IS 'Membership plan catalog (discount_bps)';
COMMENT ON TABLE fyh_customer_memberships IS 'Active customer memberships with expiry';
COMMENT ON TABLE fyh_package_plans IS 'Session package catalog linked to a service';
COMMENT ON TABLE fyh_customer_packages IS 'Purchased packages with session burn tracking';
COMMENT ON TABLE fyh_bridal_profiles IS 'Bridal booking profiles';
COMMENT ON TABLE fyh_notification_outbox IS 'Queued notifications — delivery adapters not connected yet';
