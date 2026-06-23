-- Enum label must commit before use — backfill runs in 0067 (separate transaction).
ALTER TYPE "booking_status" ADD VALUE IF NOT EXISTS 'pending_approval';
