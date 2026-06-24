CREATE TYPE "public"."sidebar_layout_type" AS ENUM('global', 'personal');

CREATE TABLE IF NOT EXISTS "sidebar_layouts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid REFERENCES "admin_users"("id") ON DELETE CASCADE,
  "layout_type" "sidebar_layout_type" NOT NULL,
  "module_key" text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "hidden" boolean NOT NULL DEFAULT false,
  "pinned" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "sidebar_layouts_global_module_unique"
  ON "sidebar_layouts" ("module_key")
  WHERE "layout_type" = 'global' AND "user_id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "sidebar_layouts_personal_module_unique"
  ON "sidebar_layouts" ("user_id", "module_key")
  WHERE "layout_type" = 'personal' AND "user_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "sidebar_layouts_user_type_idx"
  ON "sidebar_layouts" ("user_id", "layout_type", "sort_order");
