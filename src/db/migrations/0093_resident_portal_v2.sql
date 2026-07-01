-- Resident Portal V2: room change + referral program

DO $$ BEGIN
  CREATE TYPE room_change_status AS ENUM (
    'draft', 'submitted', 'approved', 'rejected', 'completed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS room_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  from_bed_id uuid NOT NULL REFERENCES beds(id) ON DELETE RESTRICT,
  to_bed_id uuid NOT NULL REFERENCES beds(id) ON DELETE RESTRICT,
  requested_shift_date text NOT NULL,
  quote_snapshot jsonb NOT NULL,
  status room_change_status NOT NULL DEFAULT 'submitted',
  admin_notes text,
  reviewed_by_admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS room_change_requests_booking_idx ON room_change_requests(booking_id);
CREATE INDEX IF NOT EXISTS room_change_requests_status_idx ON room_change_requests(status);

DO $$ BEGIN
  CREATE TYPE referral_redemption_status AS ENUM ('pending', 'applied', 'voided');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE referral_earning_status AS ENUM ('locked', 'available', 'withdrawn', 'clawed_back');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS referral_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  referee_email text NOT NULL,
  referee_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  discount_paise bigint NOT NULL DEFAULT 0,
  status referral_redemption_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS referral_redemptions_referee_email_uidx ON referral_redemptions(referee_email);
CREATE INDEX IF NOT EXISTS referral_redemptions_referrer_idx ON referral_redemptions(referrer_customer_id);

CREATE TABLE IF NOT EXISTS referral_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  redemption_id uuid NOT NULL REFERENCES referral_redemptions(id) ON DELETE RESTRICT,
  amount_paise bigint NOT NULL,
  status referral_earning_status NOT NULL DEFAULT 'locked',
  unlocked_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referral_earnings_referrer_idx ON referral_earnings(referrer_customer_id);

ALTER TYPE financial_invoice_type ADD VALUE IF NOT EXISTS 'room_shift';
