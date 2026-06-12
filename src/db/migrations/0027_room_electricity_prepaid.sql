ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "electricity_prepaid_credit_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "electricity_bills" ADD COLUMN IF NOT EXISTS "prepaid_credit_applied_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "electricity_bills" ADD COLUMN IF NOT EXISTS "prepaid_credit_note" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "room_electricity_prepaid_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"entry_kind" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"paid_by_note" text,
	"electricity_bill_id" uuid,
	"created_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_electricity_prepaid_ledger" ADD CONSTRAINT "room_electricity_prepaid_ledger_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_electricity_prepaid_ledger" ADD CONSTRAINT "room_electricity_prepaid_ledger_electricity_bill_id_electricity_bills_id_fk" FOREIGN KEY ("electricity_bill_id") REFERENCES "public"."electricity_bills"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_electricity_prepaid_ledger" ADD CONSTRAINT "room_electricity_prepaid_ledger_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "room_electricity_prepaid_ledger_room_idx" ON "room_electricity_prepaid_ledger" ("room_id", "created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_delivery_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_email" text NOT NULL,
	"recipient_kind" text NOT NULL,
	"subject" text NOT NULL,
	"notification_kind" text NOT NULL,
	"customer_id" uuid,
	"status" text NOT NULL,
	"skip_reason" text,
	"provider" text,
	"message_id" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_delivery_log" ADD CONSTRAINT "email_delivery_log_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_delivery_log_created_at_idx" ON "email_delivery_log" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_delivery_log_status_idx" ON "email_delivery_log" ("status");
