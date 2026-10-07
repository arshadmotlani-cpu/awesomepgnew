-- Allow multiple approved payments to share a transaction ref when admin overrides duplicate warning.
-- Uniqueness moves to (source_kind, source_id); ref is indexed for duplicate detection only.

ALTER TABLE pg_approved_transaction_refs
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

UPDATE pg_approved_transaction_refs SET id = gen_random_uuid() WHERE id IS NULL;

ALTER TABLE pg_approved_transaction_refs
  ALTER COLUMN id SET NOT NULL;

ALTER TABLE pg_approved_transaction_refs
  DROP CONSTRAINT IF EXISTS pg_approved_transaction_refs_pkey;

ALTER TABLE pg_approved_transaction_refs
  ADD PRIMARY KEY (id);

CREATE UNIQUE INDEX IF NOT EXISTS pg_approved_transaction_refs_source_unique
  ON pg_approved_transaction_refs (source_kind, source_id);

CREATE INDEX IF NOT EXISTS pg_approved_transaction_refs_ref_idx
  ON pg_approved_transaction_refs (transaction_ref_normalized);
