-- Phase C: opaque public invoice access token (never look up by invoice number alone).
ALTER TABLE fyh_invoices
  ADD COLUMN IF NOT EXISTS public_access_token uuid;

UPDATE fyh_invoices
SET public_access_token = gen_random_uuid()
WHERE public_access_token IS NULL;

ALTER TABLE fyh_invoices
  ALTER COLUMN public_access_token SET DEFAULT gen_random_uuid(),
  ALTER COLUMN public_access_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fyh_invoices_public_access_token_uidx
  ON fyh_invoices (public_access_token);
