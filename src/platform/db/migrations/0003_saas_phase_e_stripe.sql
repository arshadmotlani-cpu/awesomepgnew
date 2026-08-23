-- Phase E: Stripe SaaS billing (Platform DB only)
ALTER TABLE platform.organization_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id text;

CREATE UNIQUE INDEX IF NOT EXISTS platform_org_subscriptions_stripe_sub_uidx
  ON platform.organization_subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS platform_org_subscriptions_stripe_customer_uidx
  ON platform.organization_subscriptions (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS platform.billing_webhook_events (
  event_id text PRIMARY KEY,
  provider text NOT NULL DEFAULT 'stripe',
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb
);

ALTER TABLE platform.subscription_events
  ADD COLUMN IF NOT EXISTS stripe_event_id text;

CREATE UNIQUE INDEX IF NOT EXISTS platform_subscription_events_stripe_event_uidx
  ON platform.subscription_events (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;
