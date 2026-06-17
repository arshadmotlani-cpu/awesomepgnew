-- Resident lifecycle + production/test isolation flags.

CREATE TYPE residency_status AS ENUM ('active', 'vacated', 'blocked');

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS residency_status residency_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- Vacated residents: completed checkout with completed vacating notice.
UPDATE customers c
SET residency_status = 'vacated'
WHERE residency_status = 'active'
  AND EXISTS (
    SELECT 1
    FROM bookings b
    INNER JOIN vacating_requests vr ON vr.booking_id = b.id AND vr.status = 'completed'
    WHERE b.customer_id = c.id
      AND b.status = 'completed'
  );

-- Mark known test customers.
UPDATE customers
SET is_test = true
WHERE lower(email) = 'arshadmotlani@gmail.com'
   OR email LIKE '%@example.com'
   OR email LIKE '%@awesomepg.local'
   OR full_name LIKE 'Phase5.5%'
   OR full_name LIKE 'E2E User%'
   OR full_name LIKE 'Verification Bot%'
   OR full_name LIKE 'Phase5%';

UPDATE bookings b
SET is_test = true
FROM customers c
WHERE c.id = b.customer_id
  AND c.is_test = true;

-- Stop recurring billing for vacated stays.
UPDATE resident_billing_profiles rbp
SET auto_generate = false, updated_at = now()
FROM bookings b
WHERE b.id = rbp.booking_id
  AND (b.status = 'completed' OR b.is_test = true);
