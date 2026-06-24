-- Public invoice share links — /i/{share_token} (no login, no internal UUID in URL).

ALTER TABLE financial_invoices
  ADD COLUMN IF NOT EXISTS share_token text;

CREATE UNIQUE INDEX IF NOT EXISTS financial_invoices_share_token_unique
  ON financial_invoices (share_token)
  WHERE share_token IS NOT NULL;
