-- Workforce access roles + employee email uniqueness

CREATE UNIQUE INDEX IF NOT EXISTS wf_employees_email_uidx
  ON wf_employees (email)
  WHERE email IS NOT NULL;
