CREATE TABLE IF NOT EXISTS "deployments" (
  "id" serial PRIMARY KEY NOT NULL,
  "deployment_id" text NOT NULL,
  "status" text NOT NULL,
  "error_summary" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployments_deployment_id_idx" ON "deployments" ("deployment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployments_created_at_idx" ON "deployments" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployments_status_idx" ON "deployments" ("status");
