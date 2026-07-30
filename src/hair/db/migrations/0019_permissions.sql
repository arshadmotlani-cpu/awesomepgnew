-- Phase I: admin permission keys on fyh_admin_users (role presets + optional overrides)

ALTER TABLE fyh_admin_users
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN fyh_admin_users.permissions IS
  'Custom permission key overrides; empty array uses role preset (admin vs super_admin)';
