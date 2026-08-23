-- Repair invoice/customer sequences after settings de-dupe (Phase B).
UPDATE fyh_settings s
SET
  invoice_next_seq = GREATEST(
    COALESCE(s.invoice_next_seq, 1),
    COALESCE(
      (
        SELECT MAX(CAST(substring(i.invoice_number FROM '[0-9]+$') AS integer)) + 1
        FROM fyh_invoices i
        WHERE i.organization_id = s.organization_id
          AND i.invoice_number ~ '[0-9]+$'
      ),
      1
    )
  ),
  customer_code_next_seq = GREATEST(
    COALESCE(s.customer_code_next_seq, 1),
    COALESCE(
      (
        SELECT MAX(CAST(substring(c.customer_code FROM '[0-9]+$') AS integer)) + 1
        FROM fyh_customers c
        WHERE c.organization_id = s.organization_id
          AND c.customer_code IS NOT NULL
          AND c.customer_code ~ '[0-9]+$'
      ),
      1
    )
  ),
  updated_at = now();
