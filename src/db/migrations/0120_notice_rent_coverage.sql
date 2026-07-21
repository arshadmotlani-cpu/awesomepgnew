-- Notice deduction rent coverage snapshot fields.

ALTER TABLE vacating_requests
  ADD COLUMN IF NOT EXISTS notice_rent_covered_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notice_chargeable_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notice_breakdown_json jsonb;

ALTER TABLE checkout_settlements
  ADD COLUMN IF NOT EXISTS notice_rent_covered_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notice_chargeable_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notice_breakdown_json jsonb;

COMMENT ON COLUMN vacating_requests.notice_rent_covered_days IS
  'Missing-notice charge-window days already covered by paid rent at submit time.';
COMMENT ON COLUMN vacating_requests.notice_chargeable_days IS
  'Days charged to deposit: missing notice minus rent-covered days.';
COMMENT ON COLUMN checkout_settlements.notice_rent_covered_days IS
  'Snapshot of rent-covered days in notice charge window at settlement open.';
COMMENT ON COLUMN checkout_settlements.notice_chargeable_days IS
  'Chargeable notice days used for notice_deduction_paise.';
