-- For Your Hair ERP — initial auth + settings foundation

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS fyh_admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fyh_auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES fyh_admin_users(id) ON DELETE RESTRICT,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fyh_auth_sessions_token_idx ON fyh_auth_sessions (token_hash);
CREATE INDEX IF NOT EXISTS fyh_auth_sessions_admin_idx ON fyh_auth_sessions (admin_user_id);

CREATE TABLE IF NOT EXISTS fyh_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL DEFAULT 'For Your Hair',
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  theme_default text NOT NULL DEFAULT 'dark',
  updated_at timestamptz NOT NULL DEFAULT now()
);
