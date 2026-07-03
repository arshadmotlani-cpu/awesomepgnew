-- Occupancy period for electricity room contributions (checkout recovery audit).

ALTER TABLE electricity_room_contributions
  ADD COLUMN IF NOT EXISTS occupancy_start date,
  ADD COLUMN IF NOT EXISTS occupancy_end date;
