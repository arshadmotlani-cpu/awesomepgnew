CREATE UNIQUE INDEX IF NOT EXISTS resident_requests_open_prepaid_rent_refund_unique
  ON resident_requests (booking_id, type)
  WHERE type = 'prepaid_rent_refund' AND status IN ('submitted', 'under_review', 'approved');
