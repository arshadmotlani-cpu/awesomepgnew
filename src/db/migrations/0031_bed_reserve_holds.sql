-- Bed reserve (50% rent hold): separate from physical stay reservations.
CREATE TYPE "bed_reserve_status" AS ENUM (
  'pending_payment',
  'active',
  'expired',
  'cancelled',
  'converted'
);
--> statement-breakpoint
ALTER TYPE "duration_mode" ADD VALUE IF NOT EXISTS 'reserve';
--> statement-breakpoint
ALTER TYPE "payment_purpose" ADD VALUE IF NOT EXISTS 'bed_reserve';
--> statement-breakpoint
CREATE TABLE "bed_reserve_holds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "reserve_code" text NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
  "bed_id" uuid NOT NULL REFERENCES "beds"("id") ON DELETE RESTRICT,
  "booking_id" uuid NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
  "reserve_start" date NOT NULL,
  "check_in_date" date NOT NULL,
  "status" "bed_reserve_status" NOT NULL DEFAULT 'pending_payment',
  "amount_paise" bigint NOT NULL,
  "monthly_rate_snapshot_paise" bigint NOT NULL,
  "payment_proof_url" text,
  "transaction_ref" text,
  "hold_expires_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "bed_reserve_holds_check_in_after_start" CHECK ("check_in_date" > "reserve_start"),
  CONSTRAINT "bed_reserve_holds_amount_positive" CHECK ("amount_paise" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "bed_reserve_holds_reserve_code_unique" ON "bed_reserve_holds" ("reserve_code");
--> statement-breakpoint
CREATE INDEX "bed_reserve_holds_bed_id_idx" ON "bed_reserve_holds" ("bed_id");
--> statement-breakpoint
CREATE INDEX "bed_reserve_holds_customer_id_idx" ON "bed_reserve_holds" ("customer_id");
--> statement-breakpoint
CREATE INDEX "bed_reserve_holds_status_idx" ON "bed_reserve_holds" ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX "bed_reserve_holds_one_active_per_bed"
  ON "bed_reserve_holds" ("bed_id")
  WHERE "status" IN ('pending_payment', 'active');
