-- Mid-stay unused prepaid rent refund requests (separate from deposit_refund).

ALTER TYPE resident_request_type ADD VALUE IF NOT EXISTS 'prepaid_rent_refund';

CREATE UNIQUE INDEX IF NOT EXISTS resident_requests_open_prepaid_rent_refund_unique
  ON resident_requests (booking_id, type)
  WHERE type = 'prepaid_rent_refund' AND status IN ('submitted', 'under_review', 'approved');
