-- Tenant occupies one bed but blocks the whole room on the public calendar
-- (e.g. single-sharing rent in a 2-sharing room until vacating).
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS blocks_room_availability boolean NOT NULL DEFAULT false;
