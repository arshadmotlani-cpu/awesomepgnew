-- FYHAIR staff attendance: office geofence + geo evidence on attendance rows + correction audit.

ALTER TABLE fyh_settings
  ADD COLUMN IF NOT EXISTS attendance_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE wf_attendance
  ADD COLUMN IF NOT EXISTS clock_in_latitude double precision,
  ADD COLUMN IF NOT EXISTS clock_in_longitude double precision,
  ADD COLUMN IF NOT EXISTS gps_accuracy_metres integer,
  ADD COLUMN IF NOT EXISTS distance_metres integer,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

CREATE TABLE IF NOT EXISTS wf_attendance_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT fyh_default_organization_id(),
  attendance_id uuid NOT NULL REFERENCES wf_attendance(id) ON DELETE RESTRICT,
  employee_id uuid NOT NULL REFERENCES wf_employees(id) ON DELETE RESTRICT,
  work_date date NOT NULL,
  previous_status text NOT NULL,
  new_status text NOT NULL,
  reason text NOT NULL,
  corrected_by_employee_id uuid REFERENCES wf_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wf_attendance_corrections_employee_date_idx
  ON wf_attendance_corrections (employee_id, work_date);
