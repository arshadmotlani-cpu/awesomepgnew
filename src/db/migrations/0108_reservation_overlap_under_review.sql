-- GiST overlap: under_review and active reservations cannot overlap on the same bed.

ALTER TABLE bed_reservations DROP CONSTRAINT IF EXISTS bed_reservations_no_overlap_per_bed;

ALTER TABLE bed_reservations
  ADD CONSTRAINT bed_reservations_no_overlap_per_bed
  EXCLUDE USING gist (
    bed_id WITH =,
    stay_range WITH &&
  )
  WHERE (status IN ('under_review', 'active'));
