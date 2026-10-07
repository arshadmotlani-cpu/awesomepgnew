-- Mid-stay unused prepaid rent refund requests (separate from deposit_refund).
-- Enum label only — index is in 0154b (Postgres requires enum commit before use).

ALTER TYPE resident_request_type ADD VALUE IF NOT EXISTS 'prepaid_rent_refund';
