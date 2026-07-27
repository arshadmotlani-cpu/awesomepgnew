-- Append-only collections lifecycle events (invoice.generated / overdue / paid / …).
-- Money math stays in residentFinancialEngine + projectInvoice; this table is audit only.

CREATE TABLE IF NOT EXISTS billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  rent_invoice_id uuid REFERENCES rent_invoices(id) ON DELETE SET NULL,
  financial_invoice_id uuid REFERENCES financial_invoices(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_events_booking_id_idx
  ON billing_events (booking_id);

CREATE INDEX IF NOT EXISTS billing_events_rent_invoice_id_idx
  ON billing_events (rent_invoice_id);

CREATE INDEX IF NOT EXISTS billing_events_event_type_idx
  ON billing_events (event_type);

CREATE INDEX IF NOT EXISTS billing_events_created_at_idx
  ON billing_events (created_at);

COMMENT ON TABLE billing_events IS
  'Append-only invoice lifecycle events for Collections. Does not store recomputed money.';
