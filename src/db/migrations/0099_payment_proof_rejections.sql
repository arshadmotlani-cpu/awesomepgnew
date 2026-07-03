-- Payment proof rejection SSOT — structured reasons, resident messages, audit history.

CREATE TYPE payment_proof_entity_type AS ENUM (
  'rent_invoice',
  'electricity_invoice',
  'payment_link',
  'pg_payment_record',
  'stay_extension'
);

CREATE TYPE payment_proof_rejection_status AS ENUM ('active', 'superseded');

CREATE TABLE payment_proof_rejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_key text NOT NULL,
  entity_type payment_proof_entity_type NOT NULL,
  entity_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  pg_id uuid NOT NULL REFERENCES pgs(id) ON DELETE RESTRICT,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  reason_code text NOT NULL,
  reason_label text NOT NULL,
  reason_detail text,
  admin_note text,
  resident_message text NOT NULL,
  rejected_by_admin_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  rejected_at timestamptz NOT NULL DEFAULT now(),
  whatsapp_sent boolean NOT NULL DEFAULT false,
  whatsapp_message_preview text,
  status payment_proof_rejection_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_proof_rejections_entity_idx
  ON payment_proof_rejections (entity_type, entity_id, status);

CREATE INDEX payment_proof_rejections_customer_idx
  ON payment_proof_rejections (customer_id, status, rejected_at DESC);

CREATE INDEX payment_proof_rejections_review_key_idx
  ON payment_proof_rejections (review_key);
