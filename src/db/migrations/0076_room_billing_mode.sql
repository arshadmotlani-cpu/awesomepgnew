-- Room-level billing: private room = one invoice per room at configured monthly rent.

DO $$ BEGIN
  CREATE TYPE room_billing_mode AS ENUM ('per_bed', 'private_room');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS billing_mode room_billing_mode NOT NULL DEFAULT 'per_bed',
  ADD COLUMN IF NOT EXISTS private_room_monthly_rent_paise bigint;

ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_private_room_rent_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_private_room_rent_check
  CHECK (
    billing_mode = 'per_bed'
    OR (billing_mode = 'private_room' AND private_room_monthly_rent_paise IS NOT NULL AND private_room_monthly_rent_paise > 0)
  );
