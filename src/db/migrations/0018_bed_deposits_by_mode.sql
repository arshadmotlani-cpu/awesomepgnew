ALTER TABLE "bed_prices" ADD COLUMN IF NOT EXISTS "daily_security_deposit_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bed_prices" ADD COLUMN IF NOT EXISTS "weekly_security_deposit_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bed_prices" ADD COLUMN IF NOT EXISTS "monthly_security_deposit_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "bed_prices"
SET "monthly_security_deposit_paise" = "security_deposit_paise"
WHERE "monthly_security_deposit_paise" = 0 AND "security_deposit_paise" > 0;
