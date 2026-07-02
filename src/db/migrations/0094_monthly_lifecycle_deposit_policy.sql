-- Phase 3: monthly lifecycle + deposit policy inheritance (PG → room → bed)

DO $$ BEGIN
  CREATE TYPE monthly_deposit_policy AS ENUM ('one_month', 'two_month');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE pgs
  ADD COLUMN IF NOT EXISTS monthly_deposit_policy monthly_deposit_policy NOT NULL DEFAULT 'one_month';

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS monthly_deposit_policy monthly_deposit_policy;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS billing_anchor_date date;

-- PG defaults: Shanti Nagar one month, IT Park two month
UPDATE pgs
SET monthly_deposit_policy = 'one_month'
WHERE slug ILIKE '%shanti%'
   OR name ILIKE '%shanti%';

UPDATE pgs
SET monthly_deposit_policy = 'two_month'
WHERE slug IN ('it-park', 'central-avenue-male')
   OR name ILIKE '%it park%'
   OR name ILIKE '%central avenue%male%';

-- Unbounded monthly reservations (remove 2099 sentinel upper bounds)
UPDATE bed_reservations br
SET stay_range = daterange(lower(br.stay_range), NULL, '[)'),
    updated_at = now()
FROM bookings bk
WHERE br.booking_id = bk.id
  AND br.kind = 'primary'
  AND br.status IN ('active', 'hold')
  AND bk.duration_mode IN ('open_ended', 'monthly')
  AND bk.stay_type = 'monthly_stay'
  AND upper(br.stay_range) IS NOT NULL
  AND upper(br.stay_range) >= '2090-01-01'::date;

-- Billing anchor from check-in for monthly bookings
UPDATE bookings bk
SET billing_anchor_date = lower(br.stay_range)::date,
    updated_at = now()
FROM bed_reservations br
WHERE br.booking_id = bk.id
  AND br.kind = 'primary'
  AND br.status IN ('active', 'hold')
  AND bk.duration_mode IN ('open_ended', 'monthly')
  AND bk.billing_anchor_date IS NULL
  AND lower(br.stay_range) IS NOT NULL;

-- Monthly stays must not carry contractual checkout
UPDATE bookings
SET expected_checkout_date = NULL,
    updated_at = now()
WHERE duration_mode IN ('open_ended', 'monthly')
  AND stay_type = 'monthly_stay'
  AND expected_checkout_date IS NOT NULL;
