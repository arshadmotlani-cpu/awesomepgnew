-- Security hardening: mock webhook replay guard + deposit settlement audit trail.

CREATE TABLE IF NOT EXISTS webhook_replay_guard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_kind text NOT NULL,
  signature_digest text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_replay_guard_kind_digest_unique UNIQUE (webhook_kind, signature_digest)
);

CREATE INDEX IF NOT EXISTS webhook_replay_guard_created_idx
  ON webhook_replay_guard (created_at);

CREATE TABLE IF NOT EXISTS deposit_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  source text NOT NULL,
  source_id uuid,
  final_refund_paise bigint NOT NULL CHECK (final_refund_paise >= 0),
  deductions_snapshot jsonb,
  refund_method text,
  refund_reference text,
  refund_proof_url text,
  refunded_by_admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  refunded_at timestamptz NOT NULL DEFAULT now(),
  ledger_entry_id uuid REFERENCES deposit_ledger(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deposit_settlements_idempotency_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS deposit_settlements_booking_idx
  ON deposit_settlements (booking_id, created_at);
