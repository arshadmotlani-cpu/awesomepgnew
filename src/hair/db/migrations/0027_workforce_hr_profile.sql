-- Workforce HR profile: payment details, salary structure, incentive plans

ALTER TABLE wf_employees
  ADD COLUMN IF NOT EXISTS bank_account_holder_name text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS ifsc_code text,
  ADD COLUMN IF NOT EXISTS primary_payment_method text NOT NULL DEFAULT 'upi',
  ADD COLUMN IF NOT EXISTS salary_frequency text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS salary_effective_from date;

CREATE TABLE IF NOT EXISTS wf_incentive_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES wf_employees(id) ON DELETE CASCADE,
  engine_id text NOT NULL DEFAULT 'fyh_salon',
  plan_type text NOT NULL DEFAULT 'none',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_from date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wf_incentive_plans_employee_engine_uidx
  ON wf_incentive_plans (employee_id, engine_id);

CREATE INDEX IF NOT EXISTS wf_incentive_plans_engine_idx
  ON wf_incentive_plans (engine_id, plan_type);
