CREATE TABLE IF NOT EXISTS "system_health" (
  "id" serial PRIMARY KEY NOT NULL,
  "status" text NOT NULL,
  "db_status" text NOT NULL,
  "env_status" text NOT NULL,
  "last_error" text,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "system_health_updated_at_idx" ON "system_health" ("updated_at");
