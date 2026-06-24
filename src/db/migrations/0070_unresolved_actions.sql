-- P0 unresolved_actions — SSOT for admin-required steps (badges, queues, resident profile).

CREATE TYPE unresolved_action_type AS ENUM (
  'kyc_review',
  'payment_proof_review',
  'bed_assignment',
  'move_out_approval',
  'checkout_settlement',
  'deposit_refund_approval',
  'invoice_review',
  'room_transfer_approval',
  'maintenance_approval'
);

CREATE TYPE unresolved_action_status AS ENUM ('OPEN', 'CLOSED');

CREATE TYPE unresolved_action_priority AS ENUM ('low', 'medium', 'high');

CREATE TABLE IF NOT EXISTS unresolved_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type unresolved_action_type NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  resident_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  pg_id uuid REFERENCES pgs(id) ON DELETE SET NULL,
  status unresolved_action_status NOT NULL DEFAULT 'OPEN',
  priority unresolved_action_priority NOT NULL DEFAULT 'medium',
  source_key text NOT NULL,
  href text,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS unresolved_actions_source_key_unique
  ON unresolved_actions (source_key);

CREATE UNIQUE INDEX IF NOT EXISTS unresolved_actions_entity_unique
  ON unresolved_actions (action_type, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS unresolved_actions_open_type_idx
  ON unresolved_actions (status, action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS unresolved_actions_resident_open_idx
  ON unresolved_actions (resident_id, status)
  WHERE status = 'OPEN';

CREATE INDEX IF NOT EXISTS unresolved_actions_pg_open_idx
  ON unresolved_actions (pg_id, status)
  WHERE status = 'OPEN';
