-- PG-wide bulk pricing revision audit log (future bookings only; bed_prices versioned).
CREATE TABLE IF NOT EXISTS "pg_price_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "pg_id" uuid NOT NULL REFERENCES "pgs"("id") ON DELETE CASCADE,
  "admin_id" uuid NOT NULL REFERENCES "admin_users"("id") ON DELETE RESTRICT,
  "rent_percent_change" numeric(8, 4),
  "deposit_percent_change" numeric(8, 4),
  "beds_affected" integer NOT NULL,
  "old_avg_rent_paise" bigint NOT NULL,
  "new_avg_rent_paise" bigint NOT NULL,
  "old_avg_deposit_paise" bigint NOT NULL,
  "new_avg_deposit_paise" bigint NOT NULL,
  "old_total_monthly_rent_paise" bigint NOT NULL,
  "new_total_monthly_rent_paise" bigint NOT NULL,
  "reason" text,
  "bed_changes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "pg_price_revisions_pg_created_idx"
  ON "pg_price_revisions" ("pg_id", "created_at" DESC);
