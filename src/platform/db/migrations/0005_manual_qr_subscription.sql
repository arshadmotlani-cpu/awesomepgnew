-- Manual QR + transaction ID SaaS subscription billing (Platform DB)
-- Stripe Phase E tables remain; live subscribe path uses these instead.

CREATE TABLE IF NOT EXISTS platform.billing_qr_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  qr_image_url text,
  upi_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid REFERENCES platform.users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS platform.subscription_payment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES platform.organizations (id) ON DELETE RESTRICT,
  plan_id uuid NOT NULL REFERENCES platform.plans (id) ON DELETE RESTRICT,
  amount_paise bigint NOT NULL,
  transaction_ref text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  possible_duplicate boolean NOT NULL DEFAULT false,
  duplicate_of_ids uuid[] NOT NULL DEFAULT '{}',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES platform.users (id) ON DELETE SET NULL,
  review_note text,
  period_start timestamptz,
  period_end timestamptz,
  CONSTRAINT platform_subscription_payment_submissions_status_chk
    CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS platform_subscription_payment_submissions_org_idx
  ON platform.subscription_payment_submissions (organization_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS platform_subscription_payment_submissions_status_idx
  ON platform.subscription_payment_submissions (status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS platform_subscription_payment_submissions_txn_norm_idx
  ON platform.subscription_payment_submissions (lower(trim(transaction_ref)));

CREATE UNIQUE INDEX IF NOT EXISTS platform_subscription_payment_submissions_approved_txn_uidx
  ON platform.subscription_payment_submissions (lower(trim(transaction_ref)))
  WHERE status = 'approved'
    AND transaction_ref IS NOT NULL
    AND length(trim(transaction_ref)) > 0;

COMMENT ON TABLE platform.billing_qr_settings IS
  'Singleton-ish UPI QR settings for Platform SaaS manual subscription payments.';
COMMENT ON TABLE platform.subscription_payment_submissions IS
  'Manual QR + transaction ID subscription payment queue (pending → approved|rejected).';
