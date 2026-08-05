-- Owner OS Phase 1 schema (auth + event inbox)

CREATE TABLE IF NOT EXISTS "oo_admin_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "display_name" text,
  "last_login_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "oo_auth_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "admin_user_id" uuid NOT NULL REFERENCES "oo_admin_users"("id") ON DELETE restrict,
  "token_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "oo_auth_sessions_token_idx" ON "oo_auth_sessions" ("token_hash");
CREATE INDEX IF NOT EXISTS "oo_auth_sessions_admin_idx" ON "oo_auth_sessions" ("admin_user_id");

CREATE TABLE IF NOT EXISTS "oo_event_inbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_type" text NOT NULL,
  "source_engine" text NOT NULL,
  "source_brain" text,
  "payload" text DEFAULT '{}' NOT NULL,
  "processed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "oo_event_inbox_type_idx" ON "oo_event_inbox" ("event_type");
CREATE INDEX IF NOT EXISTS "oo_event_inbox_created_idx" ON "oo_event_inbox" ("created_at");
