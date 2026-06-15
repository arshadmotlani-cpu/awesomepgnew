-- Fixed stay duration mode + refund deduction metadata on resident requests
ALTER TYPE "duration_mode" ADD VALUE IF NOT EXISTS 'fixed_stay';

ALTER TABLE "resident_requests" ADD COLUMN IF NOT EXISTS "refund_deductions" jsonb;
ALTER TABLE "resident_requests" ADD COLUMN IF NOT EXISTS "final_refund_paise" bigint;
ALTER TABLE "resident_requests" ADD COLUMN IF NOT EXISTS "refund_method" text;
ALTER TABLE "resident_requests" ADD COLUMN IF NOT EXISTS "refund_paid_at" timestamptz;
