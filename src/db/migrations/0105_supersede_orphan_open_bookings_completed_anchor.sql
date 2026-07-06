-- Repair: supersede orphan open bookings when newer stay is confirmed OR completed.
-- Fixes stale Operations rows (e.g. Kunal APG-2026-0044) missed by 0103 when anchor was already completed.

WITH anchored_stays AS (
  SELECT
    b.id AS anchored_id,
    b.customer_id,
    b.created_at AS anchored_at,
    f.pg_id
  FROM bookings b
  INNER JOIN bed_reservations cbr ON cbr.booking_id = b.id AND cbr.kind = 'primary'
  INNER JOIN beds cbd ON cbd.id = cbr.bed_id
  INNER JOIN rooms cr ON cr.id = cbd.room_id
  INNER JOIN floors f ON f.id = cr.floor_id
  WHERE b.status IN ('confirmed', 'completed')
),
supersede_pairs AS (
  SELECT DISTINCT o.id AS open_booking_id, cs.anchored_id AS superseded_by
  FROM anchored_stays cs
  INNER JOIN bookings o ON o.customer_id = cs.customer_id
  WHERE o.status IN ('draft', 'pending_payment', 'pending_approval')
    AND o.created_at < cs.anchored_at
    AND o.id <> cs.anchored_id
    AND (
      EXISTS (
        SELECT 1
        FROM bed_reservations obr
        INNER JOIN beds obd ON obd.id = obr.bed_id
        INNER JOIN rooms orr ON orr.id = obd.room_id
        INNER JOIN floors of ON of.id = orr.floor_id
        WHERE obr.booking_id = o.id
          AND obr.kind = 'primary'
          AND of.pg_id = cs.pg_id
      )
      OR EXISTS (
        SELECT 1
        FROM pg_payment_records pr
        WHERE pr.booking_id = o.id
          AND pr.pg_id = cs.pg_id
      )
    )
),
marked AS (
  UPDATE bookings b
  SET status = 'superseded', updated_at = now()
  FROM supersede_pairs sp
  WHERE b.id = sp.open_booking_id
    AND b.status IN ('draft', 'pending_payment', 'pending_approval')
  RETURNING b.id
)
SELECT count(*)::int AS superseded_bookings FROM marked;

UPDATE bed_reservations br
SET status = 'cancelled', hold_expires_at = NULL, updated_at = now()
FROM bookings b
WHERE br.booking_id = b.id
  AND b.status = 'superseded'
  AND br.status = 'hold';

UPDATE pg_payment_records pr
SET
  status = 'approved',
  reviewed_at = COALESCE(pr.reviewed_at, now()),
  updated_at = now()
FROM bookings b
WHERE pr.booking_id = b.id
  AND b.status = 'superseded'
  AND pr.status = 'pending';

UPDATE action_items ai
SET status = 'resolved', updated_at = now()
WHERE ai.type = 'payment_received'
  AND ai.status IN ('open', 'in_progress')
  AND ai.source_key LIKE 'payment_review:qr-%'
  AND EXISTS (
    SELECT 1
    FROM pg_payment_records pr
    INNER JOIN bookings b ON b.id = pr.booking_id
    WHERE b.status = 'superseded'
      AND ai.source_key = 'payment_review:qr-' || pr.id::text
  );

UPDATE unresolved_actions ua
SET status = 'CLOSED', resolved_at = now(), updated_at = now()
WHERE ua.status = 'OPEN'
  AND ua.action_type = 'payment_proof_review'
  AND ua.source_key LIKE 'unresolved:payment_review:qr-%'
  AND EXISTS (
    SELECT 1
    FROM pg_payment_records pr
    INNER JOIN bookings b ON b.id = pr.booking_id
    WHERE b.status = 'superseded'
      AND ua.source_key = 'unresolved:payment_review:qr-' || pr.id::text
  );

UPDATE notifications n
SET is_archived = true
WHERE n.audience = 'admin'
  AND NOT n.is_archived
  AND n.type IN ('payment_proof_uploaded', 'payment_received')
  AND n.dedupe_key LIKE 'payment_review:qr-%'
  AND EXISTS (
    SELECT 1
    FROM pg_payment_records pr
    INNER JOIN bookings b ON b.id = pr.booking_id
    WHERE b.status = 'superseded'
      AND n.dedupe_key = 'payment_review:qr-' || pr.id::text
  );

UPDATE action_items ai
SET status = 'resolved', updated_at = now()
WHERE ai.type = 'booking_approval'
  AND ai.status IN ('open', 'in_progress')
  AND EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.status = 'superseded'
      AND ai.source_key = 'booking_approval:' || b.id::text
  );

UPDATE notifications n
SET is_archived = true
WHERE n.audience = 'admin'
  AND NOT n.is_archived
  AND EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.status = 'superseded'
      AND n.dedupe_key = 'booking_approval:' || b.id::text
  );
