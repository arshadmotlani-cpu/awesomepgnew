-- Partial unique index for open deposit-due extension requests (separate txn after enum label exists).

CREATE UNIQUE INDEX IF NOT EXISTS resident_requests_open_deposit_due_ext_unique
  ON resident_requests (booking_id, type)
  WHERE type = 'deposit_due_extension'
    AND status IN ('submitted', 'under_review', 'approved');
