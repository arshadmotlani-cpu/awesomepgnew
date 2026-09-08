-- Payroll payment records + idempotent run per org/period.

CREATE TABLE IF NOT EXISTS wf_payroll_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT fyh_default_organization_id(),
  payroll_run_id uuid NOT NULL REFERENCES wf_payroll_runs(id) ON DELETE RESTRICT,
  payroll_line_id uuid NOT NULL REFERENCES wf_payroll_lines(id) ON DELETE RESTRICT,
  employee_id uuid NOT NULL REFERENCES wf_employees(id) ON DELETE RESTRICT,
  amount_paise bigint NOT NULL,
  payment_method text NOT NULL DEFAULT 'upi',
  payment_reference text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  paid_by_employee_id uuid REFERENCES wf_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wf_payroll_payments_line_uidx ON wf_payroll_payments (payroll_line_id);
CREATE INDEX IF NOT EXISTS wf_payroll_payments_run_idx ON wf_payroll_payments (payroll_run_id);
CREATE INDEX IF NOT EXISTS wf_payroll_payments_employee_idx ON wf_payroll_payments (employee_id);

CREATE UNIQUE INDEX IF NOT EXISTS wf_payroll_runs_org_engine_period_uidx
  ON wf_payroll_runs (organization_id, engine_id, period_start, period_end);
