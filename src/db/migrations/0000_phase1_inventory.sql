-- Required Postgres extensions. Must be created before any column / index
-- that depends on them (citext columns, gen_random_uuid(), the gist EXCLUDE
-- constraints added by 0001_constraints.sql).
CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "citext";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "btree_gist";--> statement-breakpoint
CREATE TYPE "public"."admin_role" AS ENUM('super_admin', 'pg_manager', 'accountant', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."audit_actor_type" AS ENUM('customer', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."auth_provider" AS ENUM('otp', 'google', 'email');--> statement-breakpoint
CREATE TYPE "public"."bed_status" AS ENUM('available', 'maintenance', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('draft', 'pending_payment', 'confirmed', 'cancelled', 'completed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."created_via" AS ENUM('customer', 'admin');--> statement-breakpoint
CREATE TYPE "public"."duration_mode" AS ENUM('daily', 'weekly', 'monthly', 'open_ended');--> statement-breakpoint
CREATE TYPE "public"."extension_duration_mode" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."extension_requested_by" AS ENUM('customer', 'admin');--> statement-breakpoint
CREATE TYPE "public"."extension_status" AS ENUM('pending', 'approved', 'paid', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other');--> statement-breakpoint
CREATE TYPE "public"."gender_policy" AS ENUM('male', 'female', 'coed');--> statement-breakpoint
CREATE TYPE "public"."id_proof_type" AS ENUM('aadhaar', 'passport', 'pan', 'dl');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('razorpay', 'stripe', 'cash', 'upi_manual', 'bank_transfer');--> statement-breakpoint
CREATE TYPE "public"."payment_purpose" AS ENUM('booking', 'extension', 'deposit', 'refund', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('initiated', 'succeeded', 'failed', 'refunded', 'partially_refunded');--> statement-breakpoint
CREATE TYPE "public"."reservation_kind" AS ENUM('primary', 'extension');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('hold', 'active', 'cancelled', 'completed');--> statement-breakpoint
CREATE TABLE "pgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"pincode" text NOT NULL,
	"geo_lat" numeric(9, 6),
	"geo_lng" numeric(9, 6),
	"gender_policy" "gender_policy" NOT NULL,
	"amenities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pgs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "floors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pg_id" uuid NOT NULL,
	"floor_number" integer NOT NULL,
	"label" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pg_id" uuid,
	"name" text NOT NULL,
	"default_capacity" integer NOT NULL,
	"has_ac" boolean DEFAULT false NOT NULL,
	"has_attached_bath" boolean DEFAULT false NOT NULL,
	"default_amenities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"floor_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"room_number" text NOT NULL,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "beds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"bed_code" text NOT NULL,
	"status" "bed_status" DEFAULT 'available' NOT NULL,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bed_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bed_id" uuid NOT NULL,
	"daily_rate_paise" bigint DEFAULT 0 NOT NULL,
	"weekly_rate_paise" bigint DEFAULT 0 NOT NULL,
	"monthly_rate_paise" bigint DEFAULT 0 NOT NULL,
	"security_deposit_paise" bigint DEFAULT 0 NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bed_prices_at_least_one_rate_positive" CHECK ("bed_prices"."daily_rate_paise" > 0 OR "bed_prices"."weekly_rate_paise" > 0 OR "bed_prices"."monthly_rate_paise" > 0),
	CONSTRAINT "bed_prices_effective_window_valid" CHECK ("bed_prices"."effective_to" IS NULL OR "bed_prices"."effective_to" > "bed_prices"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" "citext" NOT NULL,
	"phone" text NOT NULL,
	"gender" "gender" NOT NULL,
	"dob" date,
	"id_proof_type" "id_proof_type",
	"id_proof_number" text,
	"id_proof_image_url" text,
	"address" jsonb,
	"emergency_contact" jsonb,
	"kyc_status" "kyc_status" DEFAULT 'pending' NOT NULL,
	"auth_provider" "auth_provider" DEFAULT 'otp' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" "citext" NOT NULL,
	"password_hash" text NOT NULL,
	"role" "admin_role" NOT NULL,
	"pg_scope" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_code" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" "booking_status" DEFAULT 'draft' NOT NULL,
	"duration_mode" "duration_mode" NOT NULL,
	"expected_checkout_date" date,
	"subtotal_paise" bigint DEFAULT 0 NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint DEFAULT 0 NOT NULL,
	"deposit_paise" bigint DEFAULT 0 NOT NULL,
	"pricing_snapshot" jsonb,
	"notes" text,
	"created_via" "created_via" DEFAULT 'customer' NOT NULL,
	"created_by_admin_id" uuid,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bed_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"bed_id" uuid NOT NULL,
	"stay_range" daterange NOT NULL,
	"kind" "reservation_kind" DEFAULT 'primary' NOT NULL,
	"parent_reservation_id" uuid,
	"status" "reservation_status" DEFAULT 'hold' NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stay_extensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"requested_by" "extension_requested_by" NOT NULL,
	"requested_until_date" date NOT NULL,
	"extension_duration_mode" "extension_duration_mode" NOT NULL,
	"quoted_total_paise" bigint NOT NULL,
	"status" "extension_status" DEFAULT 'pending' NOT NULL,
	"new_reservation_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"purpose" "payment_purpose" NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"provider_payment_id" text,
	"provider_order_id" text,
	"amount_paise" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" "payment_status" DEFAULT 'initiated' NOT NULL,
	"raw_payload" jsonb,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_id" uuid,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"diff" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "floors" ADD CONSTRAINT "floors_pg_id_pgs_id_fk" FOREIGN KEY ("pg_id") REFERENCES "public"."pgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_pg_id_pgs_id_fk" FOREIGN KEY ("pg_id") REFERENCES "public"."pgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_floor_id_floors_id_fk" FOREIGN KEY ("floor_id") REFERENCES "public"."floors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beds" ADD CONSTRAINT "beds_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bed_prices" ADD CONSTRAINT "bed_prices_bed_id_beds_id_fk" FOREIGN KEY ("bed_id") REFERENCES "public"."beds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bed_reservations" ADD CONSTRAINT "bed_reservations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bed_reservations" ADD CONSTRAINT "bed_reservations_bed_id_beds_id_fk" FOREIGN KEY ("bed_id") REFERENCES "public"."beds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bed_reservations" ADD CONSTRAINT "bed_reservations_parent_reservation_id_bed_reservations_id_fk" FOREIGN KEY ("parent_reservation_id") REFERENCES "public"."bed_reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_extensions" ADD CONSTRAINT "stay_extensions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_extensions" ADD CONSTRAINT "stay_extensions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "floors_pg_id_floor_number_unique" ON "floors" USING btree ("pg_id","floor_number");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_floor_id_room_number_unique" ON "rooms" USING btree ("floor_id","room_number");--> statement-breakpoint
CREATE UNIQUE INDEX "beds_room_id_bed_code_unique" ON "beds" USING btree ("room_id","bed_code");--> statement-breakpoint
CREATE INDEX "bed_prices_bed_id_idx" ON "bed_prices" USING btree ("bed_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_email_unique" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_phone_unique" ON "customers" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_email_unique" ON "admin_users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_booking_code_unique" ON "bookings" USING btree ("booking_code");--> statement-breakpoint
CREATE INDEX "bookings_customer_id_idx" ON "bookings" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bed_reservations_booking_id_idx" ON "bed_reservations" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "bed_reservations_bed_id_idx" ON "bed_reservations" USING btree ("bed_id");--> statement-breakpoint
CREATE INDEX "bed_reservations_status_idx" ON "bed_reservations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bed_reservations_hold_expiry_idx" ON "bed_reservations" USING btree ("hold_expires_at") WHERE status = 'hold';--> statement-breakpoint
CREATE INDEX "stay_extensions_booking_id_idx" ON "stay_extensions" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "stay_extensions_status_idx" ON "stay_extensions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payments_booking_id_idx" ON "payments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_payment_id_unique" ON "payments" USING btree ("provider","provider_payment_id") WHERE provider_payment_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_type","actor_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");