-- Electricity settlement calculation methods and sharing overrides.

ALTER TABLE checkout_settlements
  ADD COLUMN IF NOT EXISTS electricity_calculation_method text NOT NULL DEFAULT 'meter_reading',
  ADD COLUMN IF NOT EXISTS auto_detected_sharing_count integer,
  ADD COLUMN IF NOT EXISTS electricity_sharing_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS average_bill_paise bigint,
  ADD COLUMN IF NOT EXISTS manual_charge_paise bigint,
  ADD COLUMN IF NOT EXISTS meter_photo_missing boolean NOT NULL DEFAULT false;

ALTER TABLE checkout_settlements
  DROP CONSTRAINT IF EXISTS checkout_settlements_electricity_calculation_method_check;

ALTER TABLE checkout_settlements
  ADD CONSTRAINT checkout_settlements_electricity_calculation_method_check
  CHECK (electricity_calculation_method IN ('meter_reading', 'average_billing', 'manual_amount'));
