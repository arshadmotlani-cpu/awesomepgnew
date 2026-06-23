-- Structured trace for resident file uploads — surfaces orphan uploads admin cannot see.

CREATE TABLE IF NOT EXISTS resident_upload_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  pg_id uuid REFERENCES pgs(id) ON DELETE SET NULL,
  upload_type text NOT NULL,
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'uploaded',
  admin_visible boolean NOT NULL DEFAULT false,
  admin_queue text,
  linked_entity text,
  linked_entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX resident_upload_events_customer_idx ON resident_upload_events (customer_id, created_at DESC);
CREATE INDEX resident_upload_events_storage_path_idx ON resident_upload_events (storage_path);
CREATE INDEX resident_upload_events_admin_visible_idx ON resident_upload_events (admin_visible, created_at DESC);
CREATE INDEX resident_upload_events_created_at_idx ON resident_upload_events (created_at DESC);
