-- Phase 6: force password rotation on first admin login.
ALTER TABLE admin_users
  ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
