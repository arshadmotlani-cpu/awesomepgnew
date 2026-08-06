-- System owner provider (Arshad) — operational identity hidden from Staff Management.
ALTER TABLE wf_employees
  ADD COLUMN IF NOT EXISTS is_system_provider boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS wf_employees_one_system_provider
  ON wf_employees (is_system_provider)
  WHERE is_system_provider = true;

-- Backfill: link existing super_admin login to system provider.
UPDATE wf_employees e
SET is_system_provider = true,
    full_name = 'Arshad',
    status = 'active',
    updated_at = now()
FROM fyh_admin_users a
WHERE e.legacy_admin_user_id = a.id
  AND a.role = 'super_admin';
