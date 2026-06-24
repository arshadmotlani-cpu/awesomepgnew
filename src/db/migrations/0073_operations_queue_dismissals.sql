-- Super Admin dismissals for Operations queue — SSOT for rows removed without deleting financial records.

CREATE TABLE IF NOT EXISTS operations_queue_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  vacating_request_id uuid REFERENCES vacating_requests(id) ON DELETE SET NULL,
  settlement_id uuid REFERENCES checkout_settlements(id) ON DELETE SET NULL,
  queue_item_id text NOT NULL,
  category text NOT NULL,
  dismissed_by uuid NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  dismissed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS operations_queue_dismissals_customer_idx
  ON operations_queue_dismissals (customer_id, dismissed_at DESC);

CREATE INDEX IF NOT EXISTS operations_queue_dismissals_booking_idx
  ON operations_queue_dismissals (booking_id)
  WHERE booking_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS operations_queue_dismissals_queue_item_unique
  ON operations_queue_dismissals (queue_item_id);
