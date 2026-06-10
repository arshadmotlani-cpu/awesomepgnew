CREATE TABLE IF NOT EXISTS "app_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "level" text NOT NULL,
  "message" text NOT NULL,
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "route" text,
  "method" text,
  "user_id" text,
  "request_id" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_logs_created_at_idx" ON "app_logs" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_logs_level_idx" ON "app_logs" ("level");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_logs_route_idx" ON "app_logs" ("route");
