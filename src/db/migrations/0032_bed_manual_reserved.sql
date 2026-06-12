-- Admin manual reserve mark (parallel to manual_occupied).
ALTER TABLE "beds"
  ADD COLUMN "manual_reserved_start" date,
  ADD COLUMN "manual_reserved_check_in" date;

ALTER TABLE "beds"
  ADD CONSTRAINT "beds_manual_reserve_dates_valid"
  CHECK (
    ("manual_reserved_start" IS NULL AND "manual_reserved_check_in" IS NULL)
    OR (
      "manual_reserved_start" IS NOT NULL
      AND "manual_reserved_check_in" IS NOT NULL
      AND "manual_reserved_check_in" > "manual_reserved_start"
    )
  );
