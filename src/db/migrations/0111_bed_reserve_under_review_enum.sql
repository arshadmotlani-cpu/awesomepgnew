-- Enum extension must commit in its own migration before under_review is referenced (PostgreSQL 55P04).

DO $$ BEGIN
  ALTER TYPE bed_reserve_status ADD VALUE IF NOT EXISTS 'under_review';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
