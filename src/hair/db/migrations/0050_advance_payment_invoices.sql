-- Customer advance receipts use fyh_invoices.source = 'advance_payment' (text column, no enum constraint).
-- Ledger SSOT: payment_received (tender) + advance_credit (customer_wallet) via postCustomerAdvanceReceiveLedger.

COMMENT ON COLUMN fyh_invoices.source IS 'appointment | quick_sale | historical_import | advance_payment';
