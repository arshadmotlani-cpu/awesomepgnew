-- Room 201: private-room billing — one invoice at ₹7140/month (714000 paise).

UPDATE rooms
SET
  billing_mode = 'private_room',
  private_room_monthly_rent_paise = 714000,
  updated_at = now()
WHERE room_number = '201'
  AND archived_at IS NULL;
