-- Consolidate access roles to Owner / Manager / Biller / Staff

UPDATE wf_engine_memberships
SET job_role = 'staff', updated_at = now()
WHERE job_role IN (
  'stylist', 'barber', 'beautician', 'makeup_artist', 'nail_technician',
  'hair_assistant', 'cleaner', 'inventory_manager', 'intern',
  'housekeeping', 'security', 'driver'
);

UPDATE wf_engine_memberships
SET job_role = 'biller', updated_at = now()
WHERE job_role IN ('receptionist', 'accountant');

DELETE FROM wf_role_templates
WHERE engine_id = 'fyh_salon'
  AND access_role NOT IN ('owner', 'manager', 'biller', 'staff');
