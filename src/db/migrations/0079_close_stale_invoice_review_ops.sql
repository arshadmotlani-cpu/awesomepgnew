-- Close stale invoice_review rows — billing audit items, not Operations queue.

UPDATE unresolved_actions
SET status = 'CLOSED', resolved_at = now(), updated_at = now()
WHERE status = 'OPEN'
  AND action_type = 'invoice_review';

-- Reclassify financial audit action items (were deposit_collection_due).
UPDATE action_items
SET type = 'financial_audit_review', updated_at = now()
WHERE type = 'deposit_collection_due'
  AND source_key LIKE 'financial_audit:%';
