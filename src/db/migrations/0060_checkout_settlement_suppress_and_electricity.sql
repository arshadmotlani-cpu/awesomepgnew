-- Prevent auto-backfill from recreating admin-deleted settlements.
ALTER TABLE vacating_requests
  ADD COLUMN IF NOT EXISTS checkout_settlement_suppressed boolean NOT NULL DEFAULT false;

-- Admin controls whether electricity share reduces deposit refund at approval.
ALTER TABLE checkout_settlements
  ADD COLUMN IF NOT EXISTS electricity_deduct_from_deposit boolean NOT NULL DEFAULT true;
