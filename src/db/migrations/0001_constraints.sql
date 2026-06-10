-- Custom constraints layered on top of the Drizzle-generated schema.
--
-- These can't be expressed in Drizzle's table builders today, so they live
-- in a hand-written migration that drizzle-kit tracks via the journal.
--
-- 1. Race-proof overlap prevention on bed reservations.
--    Two non-cancelled reservations on the same bed cannot have overlapping
--    stay_range values. Enforced at the storage layer so it cannot be
--    bypassed by a buggy endpoint, retry, or admin override.
ALTER TABLE "bed_reservations"
  ADD CONSTRAINT "bed_reservations_no_overlap_per_bed"
  EXCLUDE USING gist (
    "bed_id" WITH =,
    "stay_range" WITH &&
  )
  WHERE (status IN ('hold', 'active'));
--> statement-breakpoint

-- 2. Overlap prevention on time-versioned bed pricing.
--    For any given bed, no two pricing rows may cover the same date. We
--    derive a daterange on-the-fly from (effective_from, effective_to) so we
--    can reuse the same GiST mechanism. effective_to NULL means "open-ended"
--    and is treated as +infinity by daterange().
ALTER TABLE "bed_prices"
  ADD CONSTRAINT "bed_prices_no_overlap_per_bed"
  EXCLUDE USING gist (
    "bed_id" WITH =,
    daterange("effective_from", "effective_to", '[)') WITH &&
  );
--> statement-breakpoint

-- 3. Reservation kind <-> parent invariant.
--    `primary` reservations must NOT have a parent; `extension` reservations
--    MUST have one. Keeps the chain of extensions structurally valid.
ALTER TABLE "bed_reservations"
  ADD CONSTRAINT "bed_reservations_parent_matches_kind"
  CHECK (
    (kind = 'primary' AND parent_reservation_id IS NULL)
    OR (kind = 'extension' AND parent_reservation_id IS NOT NULL)
  );
--> statement-breakpoint

-- 4. Money sanity checks. Catch obviously broken inserts (e.g. negative
--    totals when purpose is not a refund) before they pollute reports.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_money_non_negative"
  CHECK (
    subtotal_paise >= 0
    AND discount_paise >= 0
    AND tax_paise >= 0
    AND total_paise >= 0
    AND deposit_paise >= 0
  );
--> statement-breakpoint

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_sign_matches_purpose"
  CHECK (
    (purpose = 'refund' AND amount_paise <= 0)
    OR (purpose <> 'refund' AND amount_paise >= 0)
  );
--> statement-breakpoint

-- 5. updated_at auto-touch. Avoid writing the same boilerplate trigger
--    everywhere by attaching one shared function to every mutable table.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pgs', 'floors', 'room_types', 'rooms', 'beds', 'bed_prices',
    'customers', 'admin_users', 'bookings', 'bed_reservations',
    'stay_extensions', 'payments'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON %I; '
      'CREATE TRIGGER %I BEFORE UPDATE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t || '_set_updated_at', t,
      t || '_set_updated_at', t
    );
  END LOOP;
END $$;
