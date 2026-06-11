DO $$ BEGIN
  CREATE TYPE "public"."playstation_membership_plan" AS ENUM('weekly', 'biweekly', 'monthly');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."playstation_membership_status" AS ENUM('pending_payment', 'active', 'expired', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."membership_transaction_kind" AS ENUM(
    'purchase', 'renew', 'upgrade', 'admin_activate', 'admin_deactivate', 'admin_extend', 'admin_cancel', 'payment_proof'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "playstation_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL,
  "pg_id" uuid NOT NULL,
  "booking_id" uuid,
  "plan" "playstation_membership_plan" NOT NULL,
  "status" "playstation_membership_status" DEFAULT 'pending_payment' NOT NULL,
  "starts_at" timestamptz,
  "expires_at" timestamptz,
  "amount_paise" bigint NOT NULL,
  "payment_proof_url" text,
  "transaction_ref" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "membership_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "membership_id" uuid NOT NULL,
  "kind" "membership_transaction_kind" NOT NULL,
  "amount_paise" bigint DEFAULT 0 NOT NULL,
  "from_plan" "playstation_membership_plan",
  "to_plan" "playstation_membership_plan",
  "notes" text,
  "admin_id" uuid,
  "payment_proof_url" text,
  "transaction_ref" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "playstation_memberships" ADD CONSTRAINT "playstation_memberships_customer_id_customers_id_fk"
    FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "playstation_memberships" ADD CONSTRAINT "playstation_memberships_pg_id_pgs_id_fk"
    FOREIGN KEY ("pg_id") REFERENCES "public"."pgs"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "playstation_memberships" ADD CONSTRAINT "playstation_memberships_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "membership_transactions" ADD CONSTRAINT "membership_transactions_membership_id_playstation_memberships_id_fk"
    FOREIGN KEY ("membership_id") REFERENCES "public"."playstation_memberships"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "membership_transactions" ADD CONSTRAINT "membership_transactions_admin_id_admin_users_id_fk"
    FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "playstation_memberships_customer_id_idx" ON "playstation_memberships" USING btree ("customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "playstation_memberships_status_idx" ON "playstation_memberships" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "playstation_memberships_booking_id_idx" ON "playstation_memberships" USING btree ("booking_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "membership_transactions_membership_id_idx" ON "membership_transactions" USING btree ("membership_id");
