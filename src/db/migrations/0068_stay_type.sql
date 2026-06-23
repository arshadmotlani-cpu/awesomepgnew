-- User-facing stay type (monthly vs fixed-date). Internal duration_mode keeps pricing engine modes.
CREATE TYPE "stay_type" AS ENUM ('monthly_stay', 'fixed_date_stay');

ALTER TABLE "bookings" ADD COLUMN "stay_type" "stay_type";

UPDATE "bookings"
SET "stay_type" = CASE
  WHEN "duration_mode" IN ('daily', 'weekly', 'fixed_stay') THEN 'fixed_date_stay'::"stay_type"
  ELSE 'monthly_stay'::"stay_type"
END;

ALTER TABLE "bookings" ALTER COLUMN "stay_type" SET DEFAULT 'monthly_stay';
ALTER TABLE "bookings" ALTER COLUMN "stay_type" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "bookings_stay_type_idx" ON "bookings" ("stay_type");
