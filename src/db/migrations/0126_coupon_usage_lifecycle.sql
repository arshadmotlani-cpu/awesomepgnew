-- Coupon usage lifecycle: reserved at booking create, consumed only on confirm.

CREATE TYPE discount_application_lifecycle AS ENUM (
  'reserved',
  'consumed',
  'released',
  'expired'
);

ALTER TABLE discount_applications
  ADD COLUMN lifecycle_status discount_application_lifecycle NOT NULL DEFAULT 'reserved',
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN consumed_at timestamptz,
  ADD COLUMN released_at timestamptz,
  ADD COLUMN promo_coupon_id uuid REFERENCES promo_coupons(id) ON DELETE SET NULL;

ALTER TABLE coupon_redemptions
  ADD COLUMN lifecycle_status discount_application_lifecycle NOT NULL DEFAULT 'reserved',
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN consumed_at timestamptz,
  ADD COLUMN released_at timestamptz;

-- Backfill: confirmed/completed bookings → consumed
UPDATE discount_applications da
SET
  lifecycle_status = 'consumed',
  consumed_at = COALESCE(b.updated_at, da.applied_at, now())
FROM bookings b
WHERE da.booking_id = b.id
  AND b.status IN ('confirmed', 'completed');

UPDATE coupon_redemptions cr
SET
  lifecycle_status = 'consumed',
  consumed_at = COALESCE(b.updated_at, cr.created_at, now())
FROM bookings b
WHERE cr.booking_id = b.id
  AND b.status IN ('confirmed', 'completed');

-- Backfill: non-confirmed booking apps → released (repair false uses)
UPDATE discount_applications da
SET
  lifecycle_status = 'released',
  released_at = now()
FROM bookings b
WHERE da.booking_id = b.id
  AND b.status NOT IN ('confirmed', 'completed')
  AND da.lifecycle_status = 'reserved';

UPDATE coupon_redemptions cr
SET
  lifecycle_status = 'released',
  released_at = now()
FROM bookings b
WHERE cr.booking_id = b.id
  AND b.status NOT IN ('confirmed', 'completed')
  AND cr.lifecycle_status = 'reserved';

-- Rent-invoice applications (no booking) are already used at apply time
UPDATE discount_applications
SET
  lifecycle_status = 'consumed',
  consumed_at = COALESCE(consumed_at, applied_at, now())
WHERE rent_invoice_id IS NOT NULL
  AND booking_id IS NULL
  AND lifecycle_status = 'reserved';

UPDATE coupon_redemptions
SET
  lifecycle_status = 'consumed',
  consumed_at = COALESCE(consumed_at, created_at, now())
WHERE rent_invoice_id IS NOT NULL
  AND booking_id IS NULL
  AND lifecycle_status = 'reserved';

CREATE INDEX discount_applications_lifecycle_idx
  ON discount_applications (coupon_code, lifecycle_status);

CREATE INDEX discount_applications_booking_lifecycle_idx
  ON discount_applications (booking_id, lifecycle_status);

CREATE INDEX coupon_redemptions_lifecycle_idx
  ON coupon_redemptions (coupon_code, lifecycle_status);

CREATE INDEX coupon_redemptions_booking_lifecycle_idx
  ON coupon_redemptions (booking_id, lifecycle_status);

-- One active reserved promo per customer + code (booking-scoped only)
CREATE UNIQUE INDEX discount_applications_active_reserve_unique
  ON discount_applications (coupon_code, applied_by_customer_id)
  WHERE lifecycle_status = 'reserved'
    AND booking_id IS NOT NULL
    AND coupon_code IS NOT NULL
    AND applied_by_customer_id IS NOT NULL;
