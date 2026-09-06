-- Multi-service prepaid package credits: plan items, purchase snapshots, credit ledger.

ALTER TABLE fyh_package_plans
  ADD COLUMN IF NOT EXISTS normal_value_paise bigint NOT NULL DEFAULT 0;

ALTER TABLE fyh_package_plans
  ALTER COLUMN validity_days DROP NOT NULL;

COMMENT ON COLUMN fyh_package_plans.validity_days IS 'NULL = forever validity';

CREATE TABLE IF NOT EXISTS fyh_package_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT fyh_default_organization_id(),
  plan_id uuid NOT NULL REFERENCES fyh_package_plans(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES fyh_services(id) ON DELETE RESTRICT,
  quantity integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fyh_package_plan_items_quantity_positive CHECK (quantity > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS fyh_package_plan_items_plan_service_uidx
  ON fyh_package_plan_items (plan_id, service_id);

CREATE INDEX IF NOT EXISTS fyh_package_plan_items_plan_idx
  ON fyh_package_plan_items (plan_id);

CREATE INDEX IF NOT EXISTS fyh_package_plan_items_service_idx
  ON fyh_package_plan_items (service_id);

ALTER TABLE fyh_customer_packages
  ADD COLUMN IF NOT EXISTS name_snapshot text;

ALTER TABLE fyh_customer_packages
  ADD COLUMN IF NOT EXISTS offer_price_paise bigint NOT NULL DEFAULT 0;

ALTER TABLE fyh_customer_packages
  ADD COLUMN IF NOT EXISTS normal_value_paise bigint NOT NULL DEFAULT 0;

ALTER TABLE fyh_customer_packages
  ADD COLUMN IF NOT EXISTS purchase_invoice_id uuid;

ALTER TABLE fyh_customer_packages
  ADD COLUMN IF NOT EXISTS purchase_invoice_line_id uuid;

CREATE TABLE IF NOT EXISTS fyh_customer_package_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT fyh_default_organization_id(),
  customer_package_id uuid NOT NULL REFERENCES fyh_customer_packages(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES fyh_services(id) ON DELETE RESTRICT,
  service_name_snapshot text NOT NULL,
  total_credits integer NOT NULL,
  used_credits integer NOT NULL DEFAULT 0,
  effective_unit_value_paise bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fyh_customer_package_credits_total_positive CHECK (total_credits > 0),
  CONSTRAINT fyh_customer_package_credits_used_bounds CHECK (
    used_credits >= 0 AND used_credits <= total_credits
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS fyh_customer_package_credits_pkg_service_uidx
  ON fyh_customer_package_credits (customer_package_id, service_id);

CREATE INDEX IF NOT EXISTS fyh_customer_package_credits_pkg_idx
  ON fyh_customer_package_credits (customer_package_id);

CREATE INDEX IF NOT EXISTS fyh_customer_package_credits_service_idx
  ON fyh_customer_package_credits (service_id);

CREATE TABLE IF NOT EXISTS fyh_package_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT fyh_default_organization_id(),
  customer_package_id uuid NOT NULL REFERENCES fyh_customer_packages(id) ON DELETE CASCADE,
  credit_id uuid NOT NULL REFERENCES fyh_customer_package_credits(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  service_id uuid,
  quantity integer NOT NULL,
  effective_value_paise bigint NOT NULL DEFAULT 0,
  invoice_id uuid,
  invoice_line_id uuid,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fyh_package_credit_ledger_event_type_check CHECK (
    event_type IN ('purchase', 'redeem', 'void', 'expire')
  ),
  CONSTRAINT fyh_package_credit_ledger_quantity_nonzero CHECK (quantity <> 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS fyh_package_credit_ledger_idempotency_uidx
  ON fyh_package_credit_ledger (idempotency_key);

CREATE INDEX IF NOT EXISTS fyh_package_credit_ledger_pkg_idx
  ON fyh_package_credit_ledger (customer_package_id);

CREATE INDEX IF NOT EXISTS fyh_package_credit_ledger_invoice_idx
  ON fyh_package_credit_ledger (invoice_id);

-- Backfill plan items from legacy single-service plans
INSERT INTO fyh_package_plan_items (organization_id, plan_id, service_id, quantity)
SELECT
  p.organization_id,
  p.id,
  p.service_id,
  GREATEST(p.total_sessions, 1)
FROM fyh_package_plans p
WHERE p.service_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM fyh_package_plan_items i
    WHERE i.plan_id = p.id AND i.service_id = p.service_id
  );

UPDATE fyh_package_plans
SET normal_value_paise = price_paise
WHERE normal_value_paise = 0
  AND price_paise > 0;

UPDATE fyh_customer_packages cp
SET
  name_snapshot = COALESCE(cp.name_snapshot, p.name),
  offer_price_paise = CASE
    WHEN cp.offer_price_paise = 0 THEN p.price_paise
    ELSE cp.offer_price_paise
  END,
  normal_value_paise = CASE
    WHEN cp.normal_value_paise = 0 THEN COALESCE(NULLIF(p.normal_value_paise, 0), p.price_paise)
    ELSE cp.normal_value_paise
  END
FROM fyh_package_plans p
WHERE p.id = cp.plan_id;

INSERT INTO fyh_customer_package_credits (
  organization_id,
  customer_package_id,
  service_id,
  service_name_snapshot,
  total_credits,
  used_credits,
  effective_unit_value_paise
)
SELECT
  cp.organization_id,
  cp.id,
  p.service_id,
  COALESCE(s.name, 'Service'),
  GREATEST(cp.total_sessions, 1),
  LEAST(GREATEST(cp.used_sessions, 0), GREATEST(cp.total_sessions, 1)),
  CASE
    WHEN cp.total_sessions > 0 THEN FLOOR(cp.offer_price_paise::numeric / cp.total_sessions)::bigint
    ELSE 0
  END
FROM fyh_customer_packages cp
INNER JOIN fyh_package_plans p ON p.id = cp.plan_id
LEFT JOIN fyh_services s ON s.id = p.service_id
WHERE p.service_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM fyh_customer_package_credits c
    WHERE c.customer_package_id = cp.id AND c.service_id = p.service_id
  );

COMMENT ON TABLE fyh_package_plan_items IS 'Multi-service line items for a package plan';
COMMENT ON TABLE fyh_customer_package_credits IS 'Per-service prepaid credit balances on a purchased package';
COMMENT ON TABLE fyh_package_credit_ledger IS 'Append-only package credit purchase/redeem/void/expire events';
