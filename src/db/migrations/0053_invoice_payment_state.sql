-- Invoice payment lifecycle: payment_in_progress lock + expiry states.

ALTER TYPE rent_invoice_status ADD VALUE IF NOT EXISTS 'payment_in_progress';
ALTER TYPE rent_invoice_status ADD VALUE IF NOT EXISTS 'expired';

ALTER TYPE financial_invoice_status ADD VALUE IF NOT EXISTS 'payment_in_progress';
ALTER TYPE financial_invoice_status ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE financial_invoice_status ADD VALUE IF NOT EXISTS 'processing';
ALTER TYPE financial_invoice_status ADD VALUE IF NOT EXISTS 'settled';

ALTER TABLE payment_links
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS payment_links_idempotency_key_unique
  ON payment_links (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
