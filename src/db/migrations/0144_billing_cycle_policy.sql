-- Calendar-month billing policy: separate billing cycle from check-in day.
CREATE TYPE billing_cycle_policy AS ENUM ('anniversary', 'calendar_month_1st');

ALTER TABLE resident_billing_profiles
  ADD COLUMN billing_cycle_policy billing_cycle_policy NOT NULL DEFAULT 'anniversary',
  ADD COLUMN billing_cycle_migrated_at timestamptz,
  ADD COLUMN billing_cycle_migration_note text;

COMMENT ON COLUMN resident_billing_profiles.billing_cycle_policy IS
  'anniversary = legacy move-in day billing; calendar_month_1st = rent due 1st of each month';
