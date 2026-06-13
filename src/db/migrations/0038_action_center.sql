-- Action Center — actionable items + payment links for admin ops.

CREATE TYPE action_item_type AS ENUM (
  'rent_due',
  'electricity_due',
  'refund_pending',
  'kyc_pending',
  'vacating_alert',
  'payment_received',
  'maintenance_issue'
);

CREATE TYPE action_item_status AS ENUM ('open', 'in_progress', 'resolved');

CREATE TYPE action_item_priority AS ENUM ('low', 'medium', 'high');

CREATE TYPE payment_link_purpose AS ENUM ('rent', 'electricity', 'deposit');

CREATE TYPE payment_link_status AS ENUM ('active', 'paid', 'expired');

CREATE TABLE IF NOT EXISTS action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type action_item_type NOT NULL,
  title text NOT NULL,
  pg_id uuid NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  bed_id uuid REFERENCES beds(id) ON DELETE SET NULL,
  resident_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  amount bigint,
  due_date date,
  status action_item_status NOT NULL DEFAULT 'open',
  priority action_item_priority NOT NULL DEFAULT 'medium',
  source_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS action_items_source_key_unique ON action_items (source_key);

CREATE INDEX IF NOT EXISTS action_items_status_type_idx ON action_items (status, type, created_at DESC);

CREATE INDEX IF NOT EXISTS action_items_pg_idx ON action_items (pg_id, status);

CREATE TABLE IF NOT EXISTS payment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  pg_id uuid NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  amount bigint NOT NULL,
  purpose payment_link_purpose NOT NULL,
  upi_qr_url text NOT NULL,
  whatsapp_share_url text,
  status payment_link_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_links_resident_idx ON payment_links (resident_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS payment_links_pg_idx ON payment_links (pg_id, status);
