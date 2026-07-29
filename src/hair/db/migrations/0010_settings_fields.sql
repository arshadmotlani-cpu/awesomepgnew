-- Align fyh_settings with Drizzle schema used by billing/settings UI

ALTER TABLE fyh_settings
  ADD COLUMN IF NOT EXISTS business_address text,
  ADD COLUMN IF NOT EXISTS gstin text,
  ADD COLUMN IF NOT EXISTS invoice_prefix text NOT NULL DEFAULT 'FYH',
  ADD COLUMN IF NOT EXISTS invoice_next_seq integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS default_gst_bps integer NOT NULL DEFAULT 1800,
  ADD COLUMN IF NOT EXISTS default_buffer_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS business_hours jsonb;

COMMENT ON COLUMN fyh_settings.invoice_next_seq IS 'Next invoice sequence (atomic UPDATE … RETURNING)';
COMMENT ON COLUMN fyh_settings.business_hours IS 'JSON array of {dayOfWeek,open,close,closed?}';
