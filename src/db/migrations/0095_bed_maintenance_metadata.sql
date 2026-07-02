-- Bed maintenance workflow metadata (reason, dates, notes).
ALTER TABLE beds ADD COLUMN IF NOT EXISTS maintenance_reason text;
ALTER TABLE beds ADD COLUMN IF NOT EXISTS maintenance_reason_custom text;
ALTER TABLE beds ADD COLUMN IF NOT EXISTS maintenance_started_at date;
ALTER TABLE beds ADD COLUMN IF NOT EXISTS maintenance_expected_completion date;
ALTER TABLE beds ADD COLUMN IF NOT EXISTS maintenance_notes text;
