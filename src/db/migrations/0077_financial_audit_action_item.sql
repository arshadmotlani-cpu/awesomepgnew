-- Financial integrity audit tasks — separate from deposit collection / operations queue.

ALTER TYPE action_item_type ADD VALUE IF NOT EXISTS 'financial_audit_review';
