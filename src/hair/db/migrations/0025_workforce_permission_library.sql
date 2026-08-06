-- Workforce permission library: role templates + employee template flag

CREATE TABLE IF NOT EXISTS wf_role_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_id text NOT NULL,
  access_role text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_backdate_days integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wf_role_templates_engine_role_uidx
  ON wf_role_templates (engine_id, access_role);

ALTER TABLE wf_permission_grants
  ADD COLUMN IF NOT EXISTS uses_role_template boolean NOT NULL DEFAULT false;

-- Existing rows have explicit permission copies — keep as custom overrides.
UPDATE wf_permission_grants SET uses_role_template = false WHERE uses_role_template IS NOT NULL;
