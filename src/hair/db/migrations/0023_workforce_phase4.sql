-- Workforce Engine Phase 4 foundations: incentives + payroll lines

CREATE TABLE IF NOT EXISTS wf_incentives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES wf_employees (id) ON DELETE CASCADE,
  engine_id text NOT NULL,
  label text NOT NULL,
  amount_paise bigint NOT NULL DEFAULT 0,
  effective_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_by_employee_id uuid REFERENCES wf_employees (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wf_incentives_employee_engine_idx
  ON wf_incentives (employee_id, engine_id, effective_date);
CREATE INDEX IF NOT EXISTS wf_incentives_engine_status_idx
  ON wf_incentives (engine_id, status);

CREATE TABLE IF NOT EXISTS wf_payroll_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES wf_payroll_runs (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES wf_employees (id) ON DELETE CASCADE,
  salary_paise bigint NOT NULL DEFAULT 0,
  commission_paise bigint NOT NULL DEFAULT 0,
  incentive_paise bigint NOT NULL DEFAULT 0,
  deductions_paise bigint NOT NULL DEFAULT 0,
  net_paise bigint NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wf_payroll_lines_run_employee_uidx
  ON wf_payroll_lines (payroll_run_id, employee_id);
CREATE INDEX IF NOT EXISTS wf_payroll_lines_employee_idx ON wf_payroll_lines (employee_id);

COMMENT ON TABLE wf_incentives IS 'Workforce incentive awards (Phase 4 foundation)';
COMMENT ON TABLE wf_payroll_lines IS 'Draft payroll line items per employee per run';
