-- Drop Funding Sources ledger (dealership OS — not internal accounting).
-- Keep ac_seller_payments + ac_vehicle_costs; remove funding_entry_id FKs.

ALTER TABLE ac_seller_payments DROP COLUMN IF EXISTS funding_entry_id;
ALTER TABLE ac_vehicle_costs DROP COLUMN IF EXISTS funding_entry_id;

DROP TABLE IF EXISTS ac_funding_entries;
