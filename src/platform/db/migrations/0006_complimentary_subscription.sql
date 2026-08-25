-- Complimentary org access: full product with no trial clock and no payment.
ALTER TABLE platform.organization_subscriptions
  DROP CONSTRAINT IF EXISTS platform_organization_subscriptions_status_check;

ALTER TABLE platform.organization_subscriptions
  ADD CONSTRAINT platform_organization_subscriptions_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'trial'::text,
        'active'::text,
        'complimentary'::text,
        'past_due'::text,
        'suspended'::text,
        'cancelled'::text,
        'incomplete'::text,
        'unpaid'::text
      ]
    )
  );
