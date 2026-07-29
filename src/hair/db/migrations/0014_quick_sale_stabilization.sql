-- Quick Sale hold drafts + commission rules future fields

ALTER TABLE fyh_invoices
  ADD COLUMN IF NOT EXISTS pos_draft jsonb;

COMMENT ON COLUMN fyh_invoices.pos_draft IS 'Quick Sale hold: payment draft + UI-only fields until checkout';

ALTER TABLE fyh_commission_rules
  ADD COLUMN IF NOT EXISTS effective_from timestamptz,
  ADD COLUMN IF NOT EXISTS effective_to timestamptz,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS staff_role text;

ALTER TABLE fyh_commission_rules
  DROP CONSTRAINT IF EXISTS fyh_commission_rules_scope_check;

ALTER TABLE fyh_commission_rules
  ADD CONSTRAINT fyh_commission_rules_scope_check CHECK (scope IN (
    'service', 'product', 'package', 'membership',
    'gift_card', 'retail', 'course', 'bridal', 'global'
  ));

ALTER TABLE fyh_commission_rules
  DROP CONSTRAINT IF EXISTS fyh_commission_rules_rule_type_check;

ALTER TABLE fyh_commission_rules
  ADD CONSTRAINT fyh_commission_rules_rule_type_check CHECK (rule_type IN (
    'flat_percent', 'flat_amount', 'tiered_percent', 'fixed_bonus', 'role_based'
  ));

CREATE INDEX IF NOT EXISTS fyh_commission_rules_effective_idx
  ON fyh_commission_rules (is_active, priority, effective_from, effective_to);

CREATE INDEX IF NOT EXISTS fyh_invoices_quick_sale_draft_idx
  ON fyh_invoices (source, status, updated_at DESC)
  WHERE source = 'quick_sale' AND status = 'draft';
