CREATE TABLE IF NOT EXISTS "visitor_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "first_seen_at" timestamptz DEFAULT now() NOT NULL,
  "last_seen_at" timestamptz DEFAULT now() NOT NULL,
  "current_path" text,
  "traffic_source" text DEFAULT 'direct' NOT NULL,
  "utm_source" text,
  "utm_medium" text,
  "utm_campaign" text,
  "device_type" text DEFAULT 'desktop' NOT NULL,
  "country" text,
  "state" text,
  "city" text,
  "customer_id" uuid REFERENCES "customers"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "visitor_sessions_last_seen_idx" ON "visitor_sessions" ("last_seen_at");
CREATE INDEX IF NOT EXISTS "visitor_sessions_first_seen_idx" ON "visitor_sessions" ("first_seen_at");
CREATE INDEX IF NOT EXISTS "visitor_sessions_traffic_source_idx" ON "visitor_sessions" ("traffic_source");
CREATE INDEX IF NOT EXISTS "visitor_sessions_device_type_idx" ON "visitor_sessions" ("device_type");
CREATE INDEX IF NOT EXISTS "visitor_sessions_country_idx" ON "visitor_sessions" ("country");

CREATE TABLE IF NOT EXISTS "site_page_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "visitor_sessions"("id") ON DELETE CASCADE,
  "path" text NOT NULL,
  "page_key" text NOT NULL,
  "viewed_at" timestamptz DEFAULT now() NOT NULL,
  "duration_seconds" integer
);

CREATE INDEX IF NOT EXISTS "site_page_views_session_idx" ON "site_page_views" ("session_id", "viewed_at");
CREATE INDEX IF NOT EXISTS "site_page_views_page_key_idx" ON "site_page_views" ("page_key", "viewed_at");
CREATE INDEX IF NOT EXISTS "site_page_views_viewed_at_idx" ON "site_page_views" ("viewed_at");

CREATE TABLE IF NOT EXISTS "site_analytics_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid REFERENCES "visitor_sessions"("id") ON DELETE SET NULL,
  "event_type" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "site_analytics_events_type_idx" ON "site_analytics_events" ("event_type", "created_at");
CREATE INDEX IF NOT EXISTS "site_analytics_events_session_idx" ON "site_analytics_events" ("session_id");
