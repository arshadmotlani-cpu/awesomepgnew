-- Durable checkout idempotency for Quick Sale / basket checkout (FYHAIR).

ALTER TABLE fyh_invoices
  ADD COLUMN IF NOT EXISTS checkout_attempt_key text;

CREATE UNIQUE INDEX IF NOT EXISTS fyh_invoices_org_checkout_attempt_uidx
  ON fyh_invoices (organization_id, checkout_attempt_key)
  WHERE checkout_attempt_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS fyh_checkout_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  location_id uuid,
  attempt_key text NOT NULL,
  kind text NOT NULL DEFAULT 'basket_checkout',
  status text NOT NULL,
  invoice_id uuid REFERENCES fyh_invoices (id) ON DELETE SET NULL,
  error_message text,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS fyh_checkout_operations_org_attempt_uidx
  ON fyh_checkout_operations (organization_id, attempt_key);

CREATE INDEX IF NOT EXISTS fyh_checkout_operations_status_created_idx
  ON fyh_checkout_operations (status, created_at DESC);
