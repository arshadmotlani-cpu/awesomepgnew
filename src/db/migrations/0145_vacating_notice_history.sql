-- Immutable original notice history on vacating_requests
ALTER TABLE vacating_requests
  ADD COLUMN IF NOT EXISTS original_notice_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS original_vacating_date date;

UPDATE vacating_requests
SET
  original_notice_submitted_at = created_at,
  original_vacating_date = vacating_date
WHERE original_notice_submitted_at IS NULL;
