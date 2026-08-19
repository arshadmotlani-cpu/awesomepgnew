ALTER TABLE platform.memberships
  ADD COLUMN IF NOT EXISTS access_role text;

UPDATE platform.memberships
SET access_role = CASE role
  WHEN 'owner' THEN 'owner'
  WHEN 'co_owner' THEN 'co_owner'
  WHEN 'staff' THEN 'staff'
  ELSE 'staff'
END
WHERE access_role IS NULL;

ALTER TABLE platform.memberships
  ALTER COLUMN access_role SET DEFAULT 'staff';

ALTER TABLE platform.memberships
  ALTER COLUMN access_role SET NOT NULL;

ALTER TABLE platform.memberships
  ADD CONSTRAINT platform_memberships_access_role_check
  CHECK (access_role IN ('owner', 'co_owner', 'manager', 'biller', 'staff'));

ALTER TABLE platform.organization_subscriptions
  DROP CONSTRAINT IF EXISTS platform_organization_subscriptions_status_check;

UPDATE platform.organization_subscriptions
SET status = CASE status
  WHEN 'trialing' THEN 'trial'
  ELSE status
END;

ALTER TABLE platform.organization_subscriptions
  ADD CONSTRAINT platform_organization_subscriptions_status_check
  CHECK (status IN ('trial', 'active', 'past_due', 'suspended', 'cancelled'));

CREATE TABLE IF NOT EXISTS platform.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  token text NOT NULL,
  organization_id uuid REFERENCES platform.organizations (id) ON DELETE CASCADE,
  invited_by_user_id uuid NOT NULL REFERENCES platform.users (id) ON DELETE RESTRICT,
  access_role text NOT NULL,
  location_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_invitations_access_role_check
    CHECK (access_role IN ('owner', 'co_owner', 'manager', 'biller', 'staff')),
  CONSTRAINT platform_invitations_status_check
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_invitations_token_uidx ON platform.invitations (token);
CREATE INDEX IF NOT EXISTS platform_invitations_email_idx ON platform.invitations (email);
CREATE INDEX IF NOT EXISTS platform_invitations_org_idx ON platform.invitations (organization_id);

CREATE TABLE IF NOT EXISTS platform.subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES platform.organizations (id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES platform.organization_subscriptions (id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES platform.users (id) ON DELETE SET NULL,
  event_type text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_subscription_events_org_idx
  ON platform.subscription_events (organization_id, created_at);
CREATE INDEX IF NOT EXISTS platform_subscription_events_subscription_idx
  ON platform.subscription_events (subscription_id, created_at);
