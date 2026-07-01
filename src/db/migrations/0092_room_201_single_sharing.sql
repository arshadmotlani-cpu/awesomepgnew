-- Room 201: revert private-room billing; permanent single sharing aligned with Room 101.
-- Structural bed archival and resident move are applied by scripts/convert-room-201-single-sharing.ts.

UPDATE rooms
SET
  billing_mode = 'per_bed',
  private_room_monthly_rent_paise = NULL,
  updated_at = now()
WHERE room_number = '201'
  AND archived_at IS NULL
  AND billing_mode = 'private_room';
