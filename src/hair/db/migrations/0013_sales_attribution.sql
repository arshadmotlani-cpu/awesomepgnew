-- Sales attribution SSOT + commission rules foundation + admin roles

ALTER TABLE fyh_admin_users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'admin';

ALTER TABLE fyh_admin_users
  DROP CONSTRAINT IF EXISTS fyh_admin_users_role_check;

ALTER TABLE fyh_admin_users
  ADD CONSTRAINT fyh_admin_users_role_check CHECK (role IN ('admin', 'super_admin'));

UPDATE fyh_admin_users SET role = 'super_admin' WHERE role = 'admin' AND email = (
  SELECT email FROM fyh_admin_users ORDER BY created_at ASC LIMIT 1
);

ALTER TABLE fyh_invoice_lines
  ADD COLUMN IF NOT EXISTS discount_bps integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS fyh_invoice_line_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_line_id uuid NOT NULL REFERENCES fyh_invoice_lines(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES fyh_staff(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('serviced_by', 'sold_by')),
  share_bps integer NOT NULL DEFAULT 10000 CHECK (share_bps > 0 AND share_bps <= 10000),
  attributed_net_paise bigint NOT NULL DEFAULT 0 CHECK (attributed_net_paise >= 0),
  revenue_metric text NOT NULL CHECK (revenue_metric IN ('service', 'product', 'package', 'membership')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fyh_invoice_line_attr_line_idx
  ON fyh_invoice_line_attributions (invoice_line_id);

CREATE INDEX IF NOT EXISTS fyh_invoice_line_attr_staff_metric_idx
  ON fyh_invoice_line_attributions (staff_id, revenue_metric, created_at);

COMMENT ON TABLE fyh_invoice_line_attributions IS 'Staff sales attribution facts (performance SSOT); commission derived separately';

CREATE TABLE IF NOT EXISTS fyh_commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('service', 'product', 'package', 'membership', 'global')),
  scope_ref_id uuid,
  rule_type text NOT NULL CHECK (rule_type IN ('flat_percent', 'flat_amount', 'tiered_percent', 'fixed_bonus')),
  config jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fyh_commission_rules_scope_idx
  ON fyh_commission_rules (scope, scope_ref_id, is_active);

COMMENT ON TABLE fyh_commission_rules IS 'Future commission engine rules (not evaluated in billing hot path yet)';
