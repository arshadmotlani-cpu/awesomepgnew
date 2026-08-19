-- Platform SaaS identity schema (Phase 0B)

CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE IF NOT EXISTS platform.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  password_hash text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_users_email_uidx ON platform.users (email);

CREATE TABLE IF NOT EXISTS platform.platform_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES platform.users (id) ON DELETE RESTRICT,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_memberships_user_idx ON platform.platform_memberships (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS platform_memberships_user_role_uidx
  ON platform.platform_memberships (user_id, role);

CREATE TABLE IF NOT EXISTS platform.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_plans_slug_uidx ON platform.plans (slug);

CREATE TABLE IF NOT EXISTS platform.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  default_timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  gstin text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_organizations_slug_uidx ON platform.organizations (slug);

CREATE TABLE IF NOT EXISTS platform.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES platform.organizations (id) ON DELETE RESTRICT,
  name text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  address text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_locations_org_idx ON platform.locations (organization_id);
CREATE INDEX IF NOT EXISTS platform_locations_org_primary_idx
  ON platform.locations (organization_id, is_primary);

CREATE TABLE IF NOT EXISTS platform.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES platform.users (id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES platform.organizations (id) ON DELETE RESTRICT,
  role text NOT NULL DEFAULT 'member',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_memberships_user_idx ON platform.memberships (user_id);
CREATE INDEX IF NOT EXISTS platform_memberships_org_idx ON platform.memberships (organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS platform_memberships_user_org_uidx
  ON platform.memberships (user_id, organization_id);

CREATE TABLE IF NOT EXISTS platform.membership_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  membership_id uuid NOT NULL REFERENCES platform.memberships (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES platform.locations (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_membership_locations_membership_idx
  ON platform.membership_locations (membership_id);
CREATE INDEX IF NOT EXISTS platform_membership_locations_location_idx
  ON platform.membership_locations (location_id);
CREATE UNIQUE INDEX IF NOT EXISTS platform_membership_locations_membership_location_uidx
  ON platform.membership_locations (membership_id, location_id);

CREATE TABLE IF NOT EXISTS platform.organization_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES platform.organizations (id) ON DELETE RESTRICT,
  plan_id uuid NOT NULL REFERENCES platform.plans (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_org_subscriptions_org_idx
  ON platform.organization_subscriptions (organization_id);

CREATE TABLE IF NOT EXISTS platform.organization_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES platform.organizations (id) ON DELETE RESTRICT,
  feature_key text NOT NULL,
  "limit" integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_org_entitlements_org_idx
  ON platform.organization_entitlements (organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS platform_org_entitlements_org_feature_uidx
  ON platform.organization_entitlements (organization_id, feature_key);
