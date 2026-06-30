CREATE TABLE IF NOT EXISTS "electricity_settlement_ledger" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "booking_id" uuid NOT NULL,
  "checkout_settlement_id" uuid NOT NULL,
  "billing_month" date NOT NULL,
  "stay_period_start" date,
  "stay_period_end" date,
  "units" numeric(12, 2),
  "amount_paise" bigint NOT NULL,
  "status" text DEFAULT 'collected' NOT NULL,
  "electricity_bill_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "electricity_settlement_ledger" ADD CONSTRAINT "electricity_settlement_ledger_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "electricity_settlement_ledger" ADD CONSTRAINT "electricity_settlement_ledger_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "electricity_settlement_ledger" ADD CONSTRAINT "electricity_settlement_ledger_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "electricity_settlement_ledger" ADD CONSTRAINT "electricity_settlement_ledger_checkout_settlement_id_checkout_settlements_id_fk" FOREIGN KEY ("checkout_settlement_id") REFERENCES "public"."checkout_settlements"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "electricity_settlement_ledger" ADD CONSTRAINT "electricity_settlement_ledger_electricity_bill_id_electricity_bills_id_fk" FOREIGN KEY ("electricity_bill_id") REFERENCES "public"."electricity_bills"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "electricity_settlement_ledger_settlement_unique" ON "electricity_settlement_ledger" ("checkout_settlement_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "electricity_settlement_ledger_room_month_idx" ON "electricity_settlement_ledger" ("room_id", "billing_month", "status");
--> statement-breakpoint
ALTER TABLE "electricity_bills" ADD COLUMN IF NOT EXISTS "checkout_credit_applied_paise" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
INSERT INTO "electricity_settlement_ledger" (
  "room_id",
  "customer_id",
  "booking_id",
  "checkout_settlement_id",
  "billing_month",
  "stay_period_start",
  "stay_period_end",
  "units",
  "amount_paise",
  "status",
  "created_at"
)
SELECT
  bd.room_id,
  cs.customer_id,
  cs.booking_id,
  cs.id,
  date_trunc('month', vr.vacating_date::timestamp)::date,
  GREATEST(lower(br.stay_range)::date, date_trunc('month', vr.vacating_date::timestamp)::date),
  LEAST(
    COALESCE(upper(br.stay_range)::date, vr.vacating_date::date),
    (date_trunc('month', vr.vacating_date::timestamp) + interval '1 month' - interval '1 day')::date
  ),
  cs.electricity_units,
  cs.electricity_share_paise,
  'collected',
  COALESCE(cs.approved_at, cs.updated_at)
FROM checkout_settlements cs
INNER JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
INNER JOIN bed_reservations br ON br.booking_id = cs.booking_id AND br.kind = 'primary'
INNER JOIN beds bd ON bd.id = br.bed_id
WHERE cs.amounts_locked = true
  AND cs.electricity_share_paise > 0
  AND cs.electricity_deduct_from_deposit IS NOT FALSE
  AND cs.approved_at IS NOT NULL
ON CONFLICT ("checkout_settlement_id") DO NOTHING;
