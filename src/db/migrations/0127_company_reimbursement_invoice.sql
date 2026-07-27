-- Company reimbursement invoices: printable documents with zero accounting impact.

ALTER TYPE financial_invoice_type ADD VALUE IF NOT EXISTS 'company_reimbursement';

ALTER TABLE financial_invoices
  ADD COLUMN IF NOT EXISTS is_document_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exclude_from_reports boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revenue_impact boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS analytics_impact boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS financial_invoices_document_only_idx
  ON financial_invoices (is_document_only)
  WHERE is_document_only = true;
