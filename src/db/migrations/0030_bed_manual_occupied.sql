-- Admin can mark an open bed as occupied without assigning a tenant.

ALTER TABLE beds
  ADD COLUMN manual_occupied boolean NOT NULL DEFAULT false;
