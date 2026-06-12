-- Unpaid checkout holds must not block the public calendar. Only confirmed
-- (`active`) reservations participate in the GiST overlap exclusion.
ALTER TABLE "bed_reservations" DROP CONSTRAINT IF EXISTS "bed_reservations_no_overlap_per_bed";
--> statement-breakpoint
ALTER TABLE "bed_reservations"
  ADD CONSTRAINT "bed_reservations_no_overlap_per_bed"
  EXCLUDE USING gist (
    "bed_id" WITH =,
    "stay_range" WITH &&
  )
  WHERE (status IN ('active'));
