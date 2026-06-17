-- Admin drill-down and panel query performance
CREATE INDEX IF NOT EXISTS rent_invoices_month_status_idx ON rent_invoices (billing_month, status);
CREATE INDEX IF NOT EXISTS payment_links_created_at_idx ON payment_links (created_at DESC);
