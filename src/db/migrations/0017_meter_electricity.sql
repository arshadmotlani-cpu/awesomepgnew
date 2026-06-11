CREATE TYPE "public"."meter_reading_type" AS ENUM('checkin', 'monthly', 'checkout');--> statement-breakpoint
CREATE TYPE "public"."meter_recorded_by" AS ENUM('admin', 'tenant', 'system');--> statement-breakpoint
CREATE TYPE "public"."electricity_bill_status" AS ENUM('calculated', 'pending', 'paid');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meter_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pg_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"booking_id" uuid,
	"reading_type" "meter_reading_type" NOT NULL,
	"meter_image_url" text,
	"units" numeric(10, 2) NOT NULL,
	"recorded_by" "meter_recorded_by" NOT NULL DEFAULT 'admin',
	"recorded_by_id" uuid,
	"is_estimated" boolean DEFAULT false NOT NULL,
	"recorded_at" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meter_logs" ADD CONSTRAINT "meter_logs_pg_id_pgs_id_fk" FOREIGN KEY ("pg_id") REFERENCES "public"."pgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meter_logs" ADD CONSTRAINT "meter_logs_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meter_logs" ADD CONSTRAINT "meter_logs_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meter_logs_room_recorded_idx" ON "meter_logs" ("room_id", "recorded_at");--> statement-breakpoint
ALTER TABLE "electricity_bills" ADD COLUMN IF NOT EXISTS "bill_status" "electricity_bill_status" DEFAULT 'calculated' NOT NULL;--> statement-breakpoint
ALTER TABLE "electricity_bills" ADD COLUMN IF NOT EXISTS "is_estimated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "electricity_bills" ADD COLUMN IF NOT EXISTS "meter_image_url" text;--> statement-breakpoint
ALTER TABLE "electricity_bills" ADD COLUMN IF NOT EXISTS "start_meter_log_id" uuid;--> statement-breakpoint
ALTER TABLE "electricity_bills" ADD COLUMN IF NOT EXISTS "end_meter_log_id" uuid;--> statement-breakpoint
ALTER TABLE "electricity_invoices" ADD COLUMN IF NOT EXISTS "payment_proof_url" text;--> statement-breakpoint
ALTER TABLE "electricity_invoices" ADD COLUMN IF NOT EXISTS "units_share" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "electricity_invoices" ADD COLUMN IF NOT EXISTS "active_days" integer;
