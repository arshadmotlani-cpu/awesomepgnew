-- Unified financial invoice registry (single source of truth for billing)
CREATE TYPE "public"."financial_invoice_type" AS ENUM(
  'rent',
  'deposit',
  'electricity',
  'ps4',
  'penalty',
  'damage',
  'custom'
);

CREATE TYPE "public"."financial_invoice_status" AS ENUM(
  'draft',
  'sent',
  'paid',
  'overdue',
  'cancelled',
  'refunded'
);

CREATE TABLE IF NOT EXISTS "financial_invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "invoice_number" text NOT NULL,
  "invoice_type" "financial_invoice_type" NOT NULL,
  "source_table" text,
  "source_id" uuid,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "pg_id" uuid NOT NULL REFERENCES "pgs"("id") ON DELETE RESTRICT,
  "bed_id" uuid REFERENCES "beds"("id") ON DELETE SET NULL,
  "room_number" text,
  "bed_code" text,
  "amount_paise" bigint NOT NULL,
  "breakdown" jsonb,
  "status" "financial_invoice_status" NOT NULL DEFAULT 'sent',
  "due_date" date,
  "billing_month" date,
  "payment_link_id" uuid REFERENCES "payment_links"("id") ON DELETE SET NULL,
  "payment_id" uuid REFERENCES "payments"("id") ON DELETE SET NULL,
  "paid_at" timestamptz,
  "sent_at" timestamptz,
  "cancelled_at" timestamptz,
  "refunded_at" timestamptz,
  "cancellation_reason" text,
  "refund_reason" text,
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "financial_invoices_number_unique" ON "financial_invoices" ("invoice_number");
CREATE UNIQUE INDEX IF NOT EXISTS "financial_invoices_source_unique" ON "financial_invoices" ("source_table", "source_id")
  WHERE "source_table" IS NOT NULL AND "source_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "financial_invoices_status_idx" ON "financial_invoices" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "financial_invoices_pg_idx" ON "financial_invoices" ("pg_id", "billing_month");
CREATE INDEX IF NOT EXISTS "financial_invoices_customer_idx" ON "financial_invoices" ("customer_id");

CREATE TABLE IF NOT EXISTS "invoice_audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "invoice_id" uuid NOT NULL REFERENCES "financial_invoices"("id") ON DELETE CASCADE,
  "action" text NOT NULL,
  "actor_type" text NOT NULL DEFAULT 'system',
  "actor_id" uuid,
  "diff" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "invoice_audit_events_invoice_idx" ON "invoice_audit_events" ("invoice_id", "created_at");

ALTER TABLE "payment_links" ADD COLUMN IF NOT EXISTS "invoice_id" uuid REFERENCES "financial_invoices"("id") ON DELETE SET NULL;

-- Backfill rent invoices
INSERT INTO "financial_invoices" (
  "invoice_number", "invoice_type", "source_table", "source_id",
  "customer_id", "booking_id", "pg_id", "bed_id",
  "amount_paise", "breakdown", "status", "due_date", "billing_month",
  "payment_id", "paid_at", "sent_at", "cancelled_at", "cancellation_reason", "notes", "created_at", "updated_at"
)
SELECT
  ri.invoice_number,
  'rent'::financial_invoice_type,
  'rent_invoices',
  ri.id,
  ri.customer_id,
  ri.booking_id,
  ri.pg_id,
  ri.bed_id,
  ri.rent_paise + COALESCE(ri.paid_late_fee_paise, 0),
  jsonb_build_object(
    'rentPaise', ri.rent_paise,
    'lateFeePaise', COALESCE(ri.paid_late_fee_paise, 0),
    'lines', jsonb_build_array(jsonb_build_object('kind', 'rent', 'label', 'Monthly rent', 'amountPaise', ri.rent_paise))
  ),
  CASE ri.status
    WHEN 'paid' THEN 'paid'::financial_invoice_status
    WHEN 'cancelled' THEN 'cancelled'::financial_invoice_status
    WHEN 'overdue' THEN 'overdue'::financial_invoice_status
    ELSE 'sent'::financial_invoice_status
  END,
  ri.due_date,
  ri.billing_month,
  ri.payment_id,
  ri.paid_at,
  ri.created_at,
  ri.cancelled_at,
  ri.cancellation_reason,
  ri.notes,
  ri.created_at,
  ri.updated_at
FROM "rent_invoices" ri
ON CONFLICT DO NOTHING;

-- Backfill electricity invoices
INSERT INTO "financial_invoices" (
  "invoice_number", "invoice_type", "source_table", "source_id",
  "customer_id", "booking_id", "pg_id", "bed_id",
  "amount_paise", "breakdown", "status", "due_date", "billing_month",
  "payment_id", "paid_at", "sent_at", "cancelled_at", "notes", "created_at", "updated_at"
)
SELECT
  ei.invoice_number,
  'electricity'::financial_invoice_type,
  'electricity_invoices',
  ei.id,
  ei.customer_id,
  ei.booking_id,
  eb.pg_id,
  ei.bed_id,
  ei.amount_paise + COALESCE(ei.late_fee_locked_paise, 0),
  jsonb_build_object(
    'electricityPaise', ei.amount_paise,
    'lateFeePaise', COALESCE(ei.late_fee_locked_paise, 0),
    'lines', jsonb_build_array(jsonb_build_object('kind', 'electricity', 'label', 'Electricity share', 'amountPaise', ei.amount_paise))
  ),
  CASE ei.status
    WHEN 'paid' THEN 'paid'::financial_invoice_status
    WHEN 'cancelled' THEN 'cancelled'::financial_invoice_status
    WHEN 'pending' THEN
      CASE WHEN ei.due_date < CURRENT_DATE THEN 'overdue'::financial_invoice_status ELSE 'sent'::financial_invoice_status END
    ELSE 'sent'::financial_invoice_status
  END,
  ei.due_date,
  ei.billing_month,
  ei.payment_id,
  ei.paid_at,
  ei.created_at,
  ei.cancelled_at,
  ei.notes,
  ei.created_at,
  ei.updated_at
FROM "electricity_invoices" ei
INNER JOIN "electricity_bills" eb ON eb.id = ei.electricity_bill_id
ON CONFLICT DO NOTHING;
