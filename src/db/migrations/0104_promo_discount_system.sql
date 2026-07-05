-- Promo / discount audit system (extends date-coupon + referral; backward compatible).

CREATE TYPE discount_type AS ENUM ('referral', 'promo_code', 'date_coupon', 'reservation');
CREATE TYPE promo_coupon_type AS ENUM ('percentage', 'fixed');
CREATE TYPE promo_coupon_scope AS ENUM ('booking_rent', 'rent_invoice', 'bed_reserve');
CREATE TYPE referral_withdrawal_status AS ENUM ('pending', 'approved', 'paid', 'rejected');

CREATE TABLE promo_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  type promo_coupon_type NOT NULL DEFAULT 'percentage',
  percentage_bps integer,
  fixed_amount_paise bigint,
  valid_from timestamptz NOT NULL,
  valid_till timestamptz NOT NULL,
  usage_limit integer,
  per_user_limit integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  reason text,
  scope promo_coupon_scope NOT NULL DEFAULT 'booking_rent',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX promo_coupons_active_idx ON promo_coupons (active);
CREATE INDEX promo_coupons_scope_idx ON promo_coupons (scope);

CREATE TABLE discount_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_type discount_type NOT NULL,
  coupon_code text,
  referral_code text,
  original_amount_paise bigint NOT NULL,
  discount_amount_paise bigint NOT NULL,
  final_amount_paise bigint NOT NULL,
  applied_by_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  rent_invoice_id uuid REFERENCES rent_invoices(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  reason text
);

CREATE INDEX discount_applications_booking_idx ON discount_applications (booking_id);
CREATE INDEX discount_applications_invoice_idx ON discount_applications (rent_invoice_id);
CREATE INDEX discount_applications_customer_idx ON discount_applications (applied_by_customer_id);
CREATE INDEX discount_applications_type_idx ON discount_applications (discount_type);

CREATE TABLE referral_withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount_paise bigint NOT NULL,
  status referral_withdrawal_status NOT NULL DEFAULT 'pending',
  upi_id text,
  admin_notes text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX referral_withdrawal_customer_idx ON referral_withdrawal_requests (customer_id);
CREATE INDEX referral_withdrawal_status_idx ON referral_withdrawal_requests (status);

-- Rent invoice promo fields (nullable — existing rows unchanged).
ALTER TABLE rent_invoices
  ADD COLUMN IF NOT EXISTS discount_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_code text;

-- Rent invoice date-coupon redemptions (one per customer per coupon day).
ALTER TABLE coupon_redemptions
  ALTER COLUMN booking_id DROP NOT NULL;

ALTER TABLE coupon_redemptions
  ADD COLUMN IF NOT EXISTS rent_invoice_id uuid REFERENCES rent_invoices(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS coupon_redemptions_rent_invoice_unique
  ON coupon_redemptions (rent_invoice_id)
  WHERE rent_invoice_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS coupon_redemptions_customer_coupon_date_unique
  ON coupon_redemptions (customer_id, coupon_code, coupon_date)
  WHERE rent_invoice_id IS NOT NULL;
