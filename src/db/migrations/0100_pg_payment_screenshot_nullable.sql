-- Allow clearing booking QR screenshot on payment proof rejection (re-upload on same record).

ALTER TABLE pg_payment_records
  ALTER COLUMN payment_screenshot_url DROP NOT NULL;
