-- Deposit-related enum values only (must commit before using new labels in indexes).

ALTER TYPE action_item_type ADD VALUE IF NOT EXISTS 'deposit_collection_due';
ALTER TYPE resident_request_type ADD VALUE IF NOT EXISTS 'deposit_due_extension';
ALTER TYPE automation_event_type ADD VALUE IF NOT EXISTS 'deposit_collection_due';
ALTER TYPE automation_event_type ADD VALUE IF NOT EXISTS 'deposit_collection_overdue';
ALTER TYPE automation_event_type ADD VALUE IF NOT EXISTS 'deposit_collection_received';
