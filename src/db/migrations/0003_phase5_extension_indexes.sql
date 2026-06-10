-- Phase 5 — Stay extensions.
--
-- All the heavy lifting (the `stay_extensions` table, the `extension`
-- variants of `reservation_kind` / `payment_purpose`, and the
-- `parent_reservation_id` self-FK on `bed_reservations`) was already laid
-- down in Phase 1 (0000_phase1_inventory.sql / 0001_constraints.sql).
--
-- The only schema-level work Phase 5 needs is an index that makes
-- extension-chain queries cheap:
--
--   * /admin/bookings/[id] joins reservations to their parent for display,
--   * the extension service walks `parent_reservation_id` to find the
--     primary reservation it's chained off of,
--   * the customer extension UI groups extension rows under their primary.
--
-- Without this index those joins do a sequential scan over
-- `bed_reservations` once the booking volume gets non-trivial. The index
-- is partial — extensions are a small minority of reservation rows — and
-- created `IF NOT EXISTS` so the migration is rerun-safe.
CREATE INDEX IF NOT EXISTS bed_reservations_parent_idx
  ON bed_reservations (parent_reservation_id)
  WHERE parent_reservation_id IS NOT NULL;
