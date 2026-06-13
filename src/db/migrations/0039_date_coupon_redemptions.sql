CREATE TABLE IF NOT EXISTS "coupon_redemptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "coupon_code" text NOT NULL,
  "coupon_date" date NOT NULL,
  "discount_paise" bigint NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coupon_redemptions_coupon_date_idx" ON "coupon_redemptions" ("coupon_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coupon_redemptions_booking_idx" ON "coupon_redemptions" ("booking_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coupon_redemptions_created_at_idx" ON "coupon_redemptions" ("created_at");
