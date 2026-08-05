-- Workforce Engine Phase 1 (tables in FYH DB; access only via src/workforce/)

CREATE TABLE IF NOT EXISTS wf_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  mobile text,
  email text,
  password_hash text,
  can_login boolean NOT NULL DEFAULT false,
  gender text NOT NULL DEFAULT 'unspecified',
  emergency_contact text,
  joining_date date,
  aadhaar_number text,
  pan_number text,
  salary_paise bigint NOT NULL DEFAULT 0,
  upi_id text,
  qr_code_url text,
  photo_url text,
  status text NOT NULL DEFAULT 'active',
  legacy_admin_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wf_employees_mobile_uidx
  ON wf_employees (mobile) WHERE mobile IS NOT NULL;
CREATE INDEX IF NOT EXISTS wf_employees_status_idx ON wf_employees (status);
CREATE INDEX IF NOT EXISTS wf_employees_legacy_admin_idx ON wf_employees (legacy_admin_user_id);

CREATE TABLE IF NOT EXISTS wf_engine_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES wf_employees (id) ON DELETE CASCADE,
  engine_id text NOT NULL,
  rank text NOT NULL DEFAULT 'team_member',
  job_role text NOT NULL DEFAULT 'stylist',
  is_active boolean NOT NULL DEFAULT true,
  default_commission_type text NOT NULL DEFAULT 'none',
  default_commission_fixed_paise bigint NOT NULL DEFAULT 0,
  default_commission_percent_bps integer NOT NULL DEFAULT 0,
  performance_target_paise bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wf_membership_employee_engine_uidx
  ON wf_engine_memberships (employee_id, engine_id);
CREATE INDEX IF NOT EXISTS wf_membership_engine_idx
  ON wf_engine_memberships (engine_id, is_active);

CREATE TABLE IF NOT EXISTS wf_permission_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES wf_engine_memberships (id) ON DELETE CASCADE,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_backdate_days integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wf_permission_membership_uidx
  ON wf_permission_grants (membership_id);

CREATE TABLE IF NOT EXISTS wf_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES wf_employees (id) ON DELETE CASCADE,
  engine_id text NOT NULL DEFAULT 'fyh_salon',
  day_of_week integer NOT NULL,
  start_time text NOT NULL DEFAULT '10:00',
  end_time text NOT NULL DEFAULT '19:00',
  lunch_start text,
  lunch_end text,
  is_off boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wf_schedules_employee_engine_day_uidx
  ON wf_schedules (employee_id, engine_id, day_of_week);

CREATE TABLE IF NOT EXISTS wf_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES wf_employees (id) ON DELETE CASCADE,
  engine_id text NOT NULL,
  work_date date NOT NULL,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  status text NOT NULL DEFAULT 'present',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wf_attendance_employee_engine_date_uidx
  ON wf_attendance (employee_id, engine_id, work_date);

CREATE TABLE IF NOT EXISTS wf_payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_id text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wf_auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES wf_employees (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  active_engine_id text,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wf_auth_sessions_token_idx ON wf_auth_sessions (token_hash);
CREATE INDEX IF NOT EXISTS wf_auth_sessions_employee_idx ON wf_auth_sessions (employee_id);

CREATE TABLE IF NOT EXISTS wf_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES wf_employees (id) ON DELETE SET NULL,
  actor_employee_id uuid REFERENCES wf_employees (id) ON DELETE SET NULL,
  action text NOT NULL,
  diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wf_audit_employee_idx ON wf_audit_log (employee_id);

CREATE TABLE IF NOT EXISTS wf_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  employee_id uuid,
  engine_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_ref text NOT NULL DEFAULT '',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wf_events_event_id_uidx ON wf_events (event_id);
CREATE INDEX IF NOT EXISTS wf_events_type_idx ON wf_events (event_type);

COMMENT ON TABLE wf_employees IS 'Workforce Engine employee SSOT (Phase 1 hosted in FYH DB)';
