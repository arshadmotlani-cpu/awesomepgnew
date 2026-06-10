-- Phase 5.5 refinement:
--   1. electricity_bills now captures previous + current meter readings
--      (the admin's actual input) and derives units_consumed from them.
--      A CHECK keeps the two reading columns + units_consumed in sync.
--   2. electricity_invoices grow a due_date (issued_at + 3 days) and a
--      late_fee_locked_paise mirror of the rent_invoices flow, so the 3-day
--      grace + 1%/day penalty on overdue electricity can be projected on
--      read and frozen at payment time.
--
-- Backfill strategy for existing data (dev seeds, smoke-test fixtures):
--   * previous_reading_units defaults to 0
--   * current_reading_units defaults to whatever units_consumed already was
--     (so the CHECK is satisfied with no data loss)
--   * electricity_invoices.due_date defaults to created_at::date + 3 days

ALTER TABLE electricity_bills
  ADD COLUMN previous_reading_units NUMERIC(10, 2),
  ADD COLUMN current_reading_units  NUMERIC(10, 2);

UPDATE electricity_bills
   SET previous_reading_units = 0,
       current_reading_units  = units_consumed
 WHERE previous_reading_units IS NULL;

ALTER TABLE electricity_bills
  ALTER COLUMN previous_reading_units SET NOT NULL,
  ALTER COLUMN current_reading_units  SET NOT NULL;

ALTER TABLE electricity_bills
  ADD CONSTRAINT electricity_bills_readings_non_negative
    CHECK (previous_reading_units >= 0 AND current_reading_units >= 0),
  ADD CONSTRAINT electricity_bills_readings_ordered
    CHECK (current_reading_units >= previous_reading_units),
  ADD CONSTRAINT electricity_bills_units_match_readings
    CHECK (units_consumed = current_reading_units - previous_reading_units);

ALTER TABLE electricity_invoices
  ADD COLUMN due_date              DATE,
  ADD COLUMN late_fee_locked_paise BIGINT;

UPDATE electricity_invoices
   SET due_date = (created_at AT TIME ZONE 'UTC')::date + INTERVAL '3 days'
 WHERE due_date IS NULL;

ALTER TABLE electricity_invoices
  ALTER COLUMN due_date SET NOT NULL,
  ADD CONSTRAINT electricity_invoices_late_fee_locked_when_paid
    CHECK (
      status <> 'paid'
      OR late_fee_locked_paise IS NOT NULL
    );

CREATE INDEX IF NOT EXISTS electricity_invoices_due_date_idx
  ON electricity_invoices (due_date);
