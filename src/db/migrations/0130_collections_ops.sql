-- Collections Phase 3 — late fee policies, reminders, payment receipts.
-- Migration 0130 (0129 reserved for sibling billing_events if present).

-- ── Enums ──────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE late_fee_policy_type AS ENUM ('fixed_per_day', 'percent_of_principal');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE late_fee_applies_to AS ENUM ('rent', 'electricity', 'both');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE collection_reminder_channel AS ENUM ('whatsapp', 'sms', 'email', 'in_app');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE collection_reminder_anchor AS ENUM ('billing_date', 'due_date');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE collection_reminder_delivery_status AS ENUM (
    'pending',
    'sent_link',
    'failed',
    'skipped'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── late_fee_policies ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS late_fee_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pg_id uuid REFERENCES pgs(id) ON DELETE CASCADE,
  type late_fee_policy_type NOT NULL,
  amount_paise bigint,
  percent_bps integer,
  grace_days integer NOT NULL DEFAULT 0,
  max_fee_paise bigint,
  applies_to late_fee_applies_to NOT NULL DEFAULT 'rent',
  active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT late_fee_policies_type_amount_check CHECK (
    (type = 'fixed_per_day' AND amount_paise IS NOT NULL AND amount_paise >= 0)
    OR (type = 'percent_of_principal' AND percent_bps IS NOT NULL AND percent_bps >= 0)
  ),
  CONSTRAINT late_fee_policies_grace_nonneg CHECK (grace_days >= 0)
);

CREATE INDEX IF NOT EXISTS late_fee_policies_pg_active_idx
  ON late_fee_policies (pg_id, active, effective_from DESC);

CREATE INDEX IF NOT EXISTS late_fee_policies_global_active_idx
  ON late_fee_policies (active, effective_from DESC)
  WHERE pg_id IS NULL;

-- ── late_fee_waivers ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS late_fee_waivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rent_invoice_id uuid NOT NULL REFERENCES rent_invoices(id) ON DELETE CASCADE,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  reason text NOT NULL,
  actor_admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS late_fee_waivers_invoice_idx
  ON late_fee_waivers (rent_invoice_id);

-- ── collection_reminder_templates ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS collection_reminder_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  channel collection_reminder_channel NOT NULL,
  body_text text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collection_reminder_templates_key_channel_uidx UNIQUE (key, channel)
);

-- ── collection_reminder_policies ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS collection_reminder_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pg_id uuid REFERENCES pgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  channel collection_reminder_channel NOT NULL DEFAULT 'whatsapp',
  offset_days integer NOT NULL,
  anchor collection_reminder_anchor NOT NULL,
  template_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS collection_reminder_policies_enabled_idx
  ON collection_reminder_policies (enabled, offset_days, anchor);

CREATE INDEX IF NOT EXISTS collection_reminder_policies_pg_idx
  ON collection_reminder_policies (pg_id)
  WHERE pg_id IS NOT NULL;

-- ── collection_reminder_deliveries ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS collection_reminder_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES collection_reminder_policies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  rent_invoice_id uuid REFERENCES rent_invoices(id) ON DELETE SET NULL,
  channel collection_reminder_channel NOT NULL,
  status collection_reminder_delivery_status NOT NULL DEFAULT 'pending',
  provider_ref text,
  error text,
  scheduled_for_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS collection_reminder_deliveries_dedupe_uidx
  ON collection_reminder_deliveries (
    policy_id,
    customer_id,
    booking_id,
    scheduled_for_date,
    coalesce(rent_invoice_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS collection_reminder_deliveries_scheduled_idx
  ON collection_reminder_deliveries (scheduled_for_date, status);

CREATE INDEX IF NOT EXISTS collection_reminder_deliveries_customer_idx
  ON collection_reminder_deliveries (customer_id, created_at DESC);

-- ── payment_receipts ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  financial_invoice_id uuid NOT NULL REFERENCES financial_invoices(id) ON DELETE RESTRICT,
  rent_invoice_id uuid REFERENCES rent_invoices(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  proof_approval_id uuid REFERENCES pg_payment_records(id) ON DELETE SET NULL,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  method text NOT NULL,
  paid_at timestamptz NOT NULL,
  collected_by_admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  transaction_ref text,
  share_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_receipts_receipt_number_uidx UNIQUE (receipt_number),
  CONSTRAINT payment_receipts_share_token_uidx UNIQUE (share_token)
);

CREATE INDEX IF NOT EXISTS payment_receipts_customer_idx
  ON payment_receipts (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payment_receipts_booking_idx
  ON payment_receipts (booking_id);

CREATE INDEX IF NOT EXISTS payment_receipts_financial_invoice_idx
  ON payment_receipts (financial_invoice_id);

-- ── Seeds: default late fee = 1%/day, grace 0, no cap (matches legacy) ─────

INSERT INTO late_fee_policies (
  id, pg_id, type, amount_paise, percent_bps, grace_days, max_fee_paise,
  applies_to, active, effective_from
)
SELECT
  'a0000000-0000-4000-8000-000000000001'::uuid,
  NULL,
  'percent_of_principal',
  NULL,
  100,
  0,
  NULL,
  'both',
  true,
  DATE '2020-01-01'
WHERE NOT EXISTS (
  SELECT 1 FROM late_fee_policies
  WHERE pg_id IS NULL AND active = true AND type = 'percent_of_principal' AND percent_bps = 100
);

-- ── Seeds: reminder templates ──────────────────────────────────────────────

INSERT INTO collection_reminder_templates (key, channel, body_text, variables)
VALUES
  (
    'reminder_billing_minus_7',
    'whatsapp',
    'Hi {{name}}, your {{pg}} rent for {{month}} is due in 7 days ({{due_date}}). Amount: {{amount}}. Pay: {{link}}',
    '["name","pg","month","due_date","amount","link"]'::jsonb
  ),
  (
    'reminder_billing_minus_3',
    'whatsapp',
    'Hi {{name}}, reminder: {{pg}} rent for {{month}} is due in 3 days ({{due_date}}). Amount: {{amount}}. Pay: {{link}}',
    '["name","pg","month","due_date","amount","link"]'::jsonb
  ),
  (
    'reminder_billing_minus_1',
    'whatsapp',
    'Hi {{name}}, {{pg}} rent for {{month}} is due tomorrow ({{due_date}}). Amount: {{amount}}. Pay: {{link}}',
    '["name","pg","month","due_date","amount","link"]'::jsonb
  ),
  (
    'reminder_billing_day_0',
    'whatsapp',
    'Hi {{name}}, today is your {{pg}} billing date for {{month}}. Due: {{due_date}}. Amount: {{amount}}. Pay: {{link}}',
    '["name","pg","month","due_date","amount","link"]'::jsonb
  ),
  (
    'reminder_due_day_0',
    'whatsapp',
    'Hi {{name}}, your {{pg}} rent is due today ({{due_date}}). Amount: {{amount}}. Please pay: {{link}}',
    '["name","pg","month","due_date","amount","link"]'::jsonb
  ),
  (
    'reminder_due_plus_1',
    'whatsapp',
    'Hi {{name}}, your {{pg}} rent was due yesterday ({{due_date}}). Outstanding: {{amount}}. Pay now: {{link}}',
    '["name","pg","month","due_date","amount","link"]'::jsonb
  ),
  (
    'reminder_due_plus_3',
    'whatsapp',
    'Hi {{name}}, {{pg}} rent is 3 days overdue (due {{due_date}}). Outstanding: {{amount}}. Pay: {{link}}',
    '["name","pg","month","due_date","amount","link"]'::jsonb
  ),
  (
    'reminder_due_plus_7',
    'whatsapp',
    'Hi {{name}}, {{pg}} rent is 7 days overdue (due {{due_date}}). Outstanding: {{amount}}. Urgent: {{link}}',
    '["name","pg","month","due_date","amount","link"]'::jsonb
  )
ON CONFLICT (key, channel) DO NOTHING;

-- ── Seeds: reminder policies (−7, −3, −1, 0 billing, 0 due, +1, +3, +7) ───

INSERT INTO collection_reminder_policies (
  id, pg_id, name, enabled, channel, offset_days, anchor, template_key
)
VALUES
  ('b0000000-0000-4000-8000-000000000001'::uuid, NULL, 'Billing −7 days', true, 'whatsapp', -7, 'billing_date', 'reminder_billing_minus_7'),
  ('b0000000-0000-4000-8000-000000000002'::uuid, NULL, 'Billing −3 days', true, 'whatsapp', -3, 'billing_date', 'reminder_billing_minus_3'),
  ('b0000000-0000-4000-8000-000000000003'::uuid, NULL, 'Billing −1 day', true, 'whatsapp', -1, 'billing_date', 'reminder_billing_minus_1'),
  ('b0000000-0000-4000-8000-000000000004'::uuid, NULL, 'Billing day 0', true, 'whatsapp', 0, 'billing_date', 'reminder_billing_day_0'),
  ('b0000000-0000-4000-8000-000000000005'::uuid, NULL, 'Due day 0', true, 'whatsapp', 0, 'due_date', 'reminder_due_day_0'),
  ('b0000000-0000-4000-8000-000000000006'::uuid, NULL, 'Due +1 day', true, 'whatsapp', 1, 'due_date', 'reminder_due_plus_1'),
  ('b0000000-0000-4000-8000-000000000007'::uuid, NULL, 'Due +3 days', true, 'whatsapp', 3, 'due_date', 'reminder_due_plus_3'),
  ('b0000000-0000-4000-8000-000000000008'::uuid, NULL, 'Due +7 days', true, 'whatsapp', 7, 'due_date', 'reminder_due_plus_7')
ON CONFLICT (id) DO NOTHING;
