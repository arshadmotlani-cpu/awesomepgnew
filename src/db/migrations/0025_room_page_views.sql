CREATE TABLE IF NOT EXISTS "room_page_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
  "visitor_key" text NOT NULL,
  "viewed_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "room_page_views_room_viewed_idx" ON "room_page_views" ("room_id", "viewed_at");
CREATE INDEX IF NOT EXISTS "room_page_views_room_visitor_idx" ON "room_page_views" ("room_id", "visitor_key", "viewed_at");
