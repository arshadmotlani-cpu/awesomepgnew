-- Close stay_range upper bounds for completed checkouts so historical rows
-- cannot re-enter monthly electricity allocation via open-ended ranges.
UPDATE bed_reservations br
SET
  stay_range = daterange(lower(br.stay_range), vr.vacating_date, '[)'),
  updated_at = now()
FROM bookings bk
INNER JOIN vacating_requests vr ON vr.booking_id = bk.id AND vr.status = 'completed'
WHERE br.booking_id = bk.id
  AND br.kind = 'primary'
  AND br.status IN ('active', 'completed', 'hold')
  AND upper(br.stay_range) > vr.vacating_date::date;
