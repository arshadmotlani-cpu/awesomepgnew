-- Phase D: session location + composite admin email uniqueness
ALTER TABLE wf_auth_sessions ADD COLUMN IF NOT EXISTS location_id uuid;
ALTER TABLE fyh_auth_sessions ADD COLUMN IF NOT EXISTS location_id uuid;

DROP INDEX IF EXISTS fyh_admin_users_email_key;
DROP INDEX IF EXISTS fyh_admin_users_email_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS fyh_admin_users_org_email_uidx
  ON fyh_admin_users (organization_id, email);
