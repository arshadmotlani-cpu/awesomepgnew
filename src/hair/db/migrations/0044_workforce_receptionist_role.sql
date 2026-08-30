-- Add Receptionist as a first-class workforce access role (front-desk permissions).

INSERT INTO wf_role_templates (engine_id, access_role, permissions, max_backdate_days)
SELECT
  'fyh_salon',
  'receptionist',
  '[
    "dashboard.view",
    "dashboard.view_customers",
    "customers.view",
    "customers.edit",
    "appointments.receive_bookings",
    "appointments.view_all",
    "appointments.edit",
    "billing.view",
    "billing.create_invoice",
    "services.view",
    "packages.view",
    "memberships.view",
    "calendar.view",
    "cash_drawer.view"
  ]'::jsonb,
  0
WHERE NOT EXISTS (
  SELECT 1
  FROM wf_role_templates
  WHERE engine_id = 'fyh_salon' AND access_role = 'receptionist'
);
