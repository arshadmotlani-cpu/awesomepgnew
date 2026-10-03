-- Cross-room transfer: old-room meter evidence (reading + photo) before tenancy move.

ALTER TYPE meter_reading_type ADD VALUE IF NOT EXISTS 'room_transfer';

ALTER TABLE room_change_requests
  ADD COLUMN IF NOT EXISTS transfer_meter_log_id uuid REFERENCES meter_logs (id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS room_change_requests_transfer_meter_log_idx
  ON room_change_requests (transfer_meter_log_id)
  WHERE transfer_meter_log_id IS NOT NULL;

COMMENT ON COLUMN room_change_requests.transfer_meter_log_id IS
  'Immutable room_transfer meter log for old-room electricity evidence at cross-room bed transfer.';
