-- Future-dated room sharing + pricing configuration (capacity, rent, deposit).
CREATE TYPE "room_configuration_schedule_status" AS ENUM ('scheduled', 'applied', 'cancelled');

CREATE TABLE IF NOT EXISTS "room_configuration_schedules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "pg_id" uuid NOT NULL REFERENCES "pgs"("id") ON DELETE CASCADE,
  "room_id" uuid NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
  "status" "room_configuration_schedule_status" NOT NULL DEFAULT 'scheduled',
  "effective_from" date NOT NULL,
  "target_bed_count" integer NOT NULL,
  "room_type_name" text NOT NULL,
  "has_ac" boolean NOT NULL DEFAULT false,
  "daily_rate_paise" bigint NOT NULL DEFAULT 0,
  "weekly_rate_paise" bigint NOT NULL DEFAULT 0,
  "monthly_rate_paise" bigint NOT NULL DEFAULT 0,
  "daily_deposit_paise" bigint NOT NULL DEFAULT 0,
  "weekly_deposit_paise" bigint NOT NULL DEFAULT 0,
  "monthly_deposit_paise" bigint NOT NULL DEFAULT 0,
  "previous_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by_admin_id" uuid REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "cancelled_at" timestamptz,
  "cancel_reason" text,
  "applied_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "room_configuration_schedules_bed_count_check"
    CHECK ("target_bed_count" >= 1 AND "target_bed_count" <= 6)
);

CREATE INDEX IF NOT EXISTS "room_configuration_schedules_room_effective_idx"
  ON "room_configuration_schedules" ("room_id", "effective_from" DESC);

CREATE INDEX IF NOT EXISTS "room_configuration_schedules_pg_status_idx"
  ON "room_configuration_schedules" ("pg_id", "status", "effective_from");

CREATE UNIQUE INDEX IF NOT EXISTS "room_configuration_schedules_room_effective_scheduled_uidx"
  ON "room_configuration_schedules" ("room_id", "effective_from")
  WHERE "status" = 'scheduled';
