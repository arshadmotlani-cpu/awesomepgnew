CREATE TABLE IF NOT EXISTS "room_electricity_ledger_cycles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL,
  "billing_month" date NOT NULL,
  "total_bill_paise" bigint DEFAULT 0 NOT NULL,
  "collected_paise" bigint DEFAULT 0 NOT NULL,
  "remaining_paise" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "room_electricity_ledger_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cycle_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "booking_id" uuid NOT NULL,
  "amount_paise" bigint NOT NULL,
  "source" text NOT NULL,
  "checkout_settlement_id" uuid,
  "collected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "room_electricity_ledger_cycles" ADD CONSTRAINT "room_electricity_ledger_cycles_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "room_electricity_ledger_entries" ADD CONSTRAINT "room_electricity_ledger_entries_cycle_id_room_electricity_ledger_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."room_electricity_ledger_cycles"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "room_electricity_ledger_entries" ADD CONSTRAINT "room_electricity_ledger_entries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "room_electricity_ledger_entries" ADD CONSTRAINT "room_electricity_ledger_entries_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "room_electricity_ledger_entries" ADD CONSTRAINT "room_electricity_ledger_entries_checkout_settlement_id_checkout_settlements_id_fk" FOREIGN KEY ("checkout_settlement_id") REFERENCES "public"."checkout_settlements"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "room_electricity_ledger_cycles_room_month_unique" ON "room_electricity_ledger_cycles" ("room_id", "billing_month");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "room_electricity_ledger_cycles_room_idx" ON "room_electricity_ledger_cycles" ("room_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "room_electricity_ledger_entries_checkout_unique" ON "room_electricity_ledger_entries" ("checkout_settlement_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "room_electricity_ledger_entries_cycle_idx" ON "room_electricity_ledger_entries" ("cycle_id");
