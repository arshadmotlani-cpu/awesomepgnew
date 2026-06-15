-- Deposit-related enum values (separate migration: PG cannot use new enum labels in the same txn).

ALTER TYPE action_item_type ADD VALUE IF NOT EXISTS 'deposit_collection_due';
ALTER TYPE resident_request_type ADD VALUE IF NOT EXISTS 'deposit_due_extension';
ALTER TYPE automation_event_type ADD VALUE IF NOT EXISTS 'deposit_collection_due';
ALTER TYPE automation_event_type ADD VALUE IF NOT EXISTS 'deposit_collection_overdue';
ALTER TYPE automation_event_type ADD VALUE IF NOT EXISTS 'deposit_collection_received';

CREATE UNIQUE INDEX IF NOT EXISTS resident_requests_open_deposit_due_ext_unique
  ON resident_requests (booking_id, type)
  WHERE type = 'deposit_due_extension'
    AND status IN ('submitted', 'under_review', 'approved');
