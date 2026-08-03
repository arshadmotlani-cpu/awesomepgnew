-- Room OS Wave 6 — payment proof workflow instances (orchestration audit layer).

CREATE TABLE IF NOT EXISTS room_os_workflow_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_type text NOT NULL DEFAULT 'payment_proof_v1',
  review_key text NOT NULL,
  entity_kind text NOT NULL,
  entity_id uuid NOT NULL,
  booking_id uuid,
  pg_id uuid NOT NULL REFERENCES pgs (id) ON DELETE CASCADE,
  current_state text NOT NULL,
  idempotency_key text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  transitions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_os_workflow_instances_review_key_unique UNIQUE (review_key),
  CONSTRAINT room_os_workflow_instances_idempotency_key_unique UNIQUE (idempotency_key),
  CONSTRAINT room_os_workflow_instances_state_check CHECK (
    current_state IN ('submitted', 'under_review', 'approved', 'rejected', 'resubmitted')
  )
);

CREATE INDEX IF NOT EXISTS room_os_workflow_instances_pg_idx
  ON room_os_workflow_instances (pg_id);

CREATE INDEX IF NOT EXISTS room_os_workflow_instances_booking_idx
  ON room_os_workflow_instances (booking_id);

COMMENT ON TABLE room_os_workflow_instances IS
  'Room OS payment proof workflow orchestration — derived audit layer; Payment SSOT remains truth.';
