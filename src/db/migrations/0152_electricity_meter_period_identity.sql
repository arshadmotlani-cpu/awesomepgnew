-- Meter-interval identity for room electricity bills (not calendar-month identity).
-- Allows multiple finalized bills in the same reporting month when meter periods differ.

ALTER TABLE electricity_bills
  ADD COLUMN IF NOT EXISTS period_start_date date;

ALTER TABLE electricity_bills
  ADD COLUMN IF NOT EXISTS period_end_date date;

COMMENT ON COLUMN electricity_bills.period_start_date IS
  'Opening meter reading date for this consumption interval (authoritative for occupancy allocation).';

COMMENT ON COLUMN electricity_bills.period_end_date IS
  'Closing meter reading date for this consumption interval (authoritative for occupancy allocation).';

DROP INDEX IF EXISTS electricity_bills_room_month_unique;

CREATE UNIQUE INDEX IF NOT EXISTS electricity_bills_room_meter_interval_unique
  ON electricity_bills (room_id, previous_reading_units, current_reading_units)
  WHERE is_pipeline_test = false;

CREATE INDEX IF NOT EXISTS electricity_bills_room_period_idx
  ON electricity_bills (room_id, period_start_date, period_end_date);

CREATE INDEX IF NOT EXISTS electricity_bills_room_created_idx
  ON electricity_bills (room_id, created_at);
