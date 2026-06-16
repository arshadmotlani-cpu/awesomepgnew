-- Combined invoices + partial payment status
ALTER TYPE financial_invoice_type ADD VALUE IF NOT EXISTS 'combined';
ALTER TYPE financial_invoice_status ADD VALUE IF NOT EXISTS 'partial';
ALTER TYPE payment_link_purpose ADD VALUE IF NOT EXISTS 'combined';
