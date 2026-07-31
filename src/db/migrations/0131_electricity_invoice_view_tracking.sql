ALTER TABLE electricity_invoices
  ADD COLUMN IF NOT EXISTS first_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS viewed_source text;
