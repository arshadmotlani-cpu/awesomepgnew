-- Standalone customer invoices (non-resident / no booking).

ALTER TYPE financial_invoice_type ADD VALUE IF NOT EXISTS 'standalone';
