-- Late-fee base = applicable monthly room rent (not prorated invoice principal).
-- Frozen at generation; move-out proration must not overwrite this column.
-- Paid invoices keep late_fee_locked_paise; this backfill does not rewrite locked fees.

ALTER TABLE rent_invoices
  ADD COLUMN IF NOT EXISTS late_fee_base_paise bigint NOT NULL DEFAULT 0;

UPDATE rent_invoices ri
SET late_fee_base_paise = CASE
  WHEN COALESCE(b.subtotal_paise, 0) > 0 THEN b.subtotal_paise
  ELSE ri.rent_paise
END
FROM bookings b
WHERE b.id = ri.booking_id
  AND COALESCE(ri.late_fee_base_paise, 0) = 0;

COMMENT ON COLUMN rent_invoices.late_fee_base_paise IS
  'Applicable monthly room rent used as late-fee principal. Independent of move-out proration on rent_paise.';
