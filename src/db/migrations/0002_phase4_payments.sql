-- Phase 4 — Payments.
--
-- Schema delta required by Phase 4:
--
-- 1. Add the `mock` value to `payment_provider` so the in-process mock
--    adapter (used in dev + CI) can write to `payments.provider` without
--    masquerading as Razorpay. Postgres 12+ supports `ADD VALUE` inside a
--    transaction, so this is safe to run via the standard Drizzle migrator.
ALTER TYPE "payment_provider" ADD VALUE IF NOT EXISTS 'mock';
