-- Action item types for fixed-stay checkout + refund request tracking
ALTER TYPE "action_item_type" ADD VALUE IF NOT EXISTS 'fixed_stay_checkout_due';
ALTER TYPE "action_item_type" ADD VALUE IF NOT EXISTS 'refund_request_submitted';

-- Optional PG-level average electricity bill for checkout fallback
ALTER TABLE "pgs" ADD COLUMN IF NOT EXISTS "average_electricity_bill_paise" bigint;
