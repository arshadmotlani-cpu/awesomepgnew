-- Unified user notifications + Web Push subscriptions (PWA)

CREATE TYPE notification_audience AS ENUM ('admin', 'resident');

CREATE TYPE notification_priority AS ENUM ('critical', 'important', 'informational');

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  audience notification_audience NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  priority notification_priority NOT NULL DEFAULT 'informational',
  entity_type text,
  entity_id uuid,
  deep_link text NOT NULL,
  dedupe_key text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT notifications_dedupe_unique UNIQUE (audience, user_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications (audience, user_id, is_read, is_archived, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_type_idx
  ON notifications (type, created_at DESC);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  audience notification_audience NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  device_name text,
  platform text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON push_subscriptions (audience, user_id);
