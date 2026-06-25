-- Resolve stale MISSING_RENT_INVOICE audit tasks when a rent invoice already exists.

UPDATE action_items ai
SET status = 'resolved', updated_at = now()
WHERE ai.status IN ('open', 'in_progress')
  AND ai.source_key LIKE 'financial_audit:MISSING_RENT_INVOICE:%'
  AND EXISTS (
    SELECT 1 FROM rent_invoices ri
    WHERE ri.is_adhoc = false
      AND ri.status != 'cancelled'
      AND (
        ri.booking_id::text = split_part(ai.source_key, ':', 3)
        OR (ai.metadata->>'bookingId') IS NOT NULL
          AND ri.booking_id::text = ai.metadata->>'bookingId'
      )
  );
