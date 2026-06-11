CREATE TYPE "public"."pg_payment_record_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TABLE "pgs" ADD COLUMN IF NOT EXISTS "has_payment_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pgs" ADD COLUMN IF NOT EXISTS "owner_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pgs" ADD CONSTRAINT "pgs_owner_id_admin_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pg_payment_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pg_id" uuid NOT NULL,
	"name" text NOT NULL,
	"qr_code_image_url" text NOT NULL,
	"upi_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pg_payment_categories" ADD CONSTRAINT "pg_payment_categories_pg_id_pgs_id_fk" FOREIGN KEY ("pg_id") REFERENCES "public"."pgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pg_payment_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pg_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"month" text,
	"status" "pg_payment_record_status" DEFAULT 'pending' NOT NULL,
	"payment_screenshot_url" text NOT NULL,
	"transaction_ref" text,
	"reviewed_by_admin_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pg_payment_records" ADD CONSTRAINT "pg_payment_records_pg_id_pgs_id_fk" FOREIGN KEY ("pg_id") REFERENCES "public"."pgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pg_payment_records" ADD CONSTRAINT "pg_payment_records_category_id_pg_payment_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."pg_payment_categories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pg_payment_records" ADD CONSTRAINT "pg_payment_records_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pg_payment_records_pending_month_unique" ON "pg_payment_records" ("category_id","customer_id","month") WHERE "status" = 'pending' AND "month" IS NOT NULL;
