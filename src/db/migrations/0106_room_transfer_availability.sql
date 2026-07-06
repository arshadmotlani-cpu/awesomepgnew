-- Room transfer availability: Move Now vs Scheduled Transfer scenarios

DO $$ BEGIN
  CREATE TYPE room_transfer_mode AS ENUM ('immediate', 'scheduled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE room_change_status ADD VALUE IF NOT EXISTS 'waiting';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE room_change_requests
  ADD COLUMN IF NOT EXISTS transfer_mode room_transfer_mode,
  ADD COLUMN IF NOT EXISTS occupant_checkout_date text,
  ADD COLUMN IF NOT EXISTS expected_transfer_date text,
  ADD COLUMN IF NOT EXISTS source_vacating_request_id uuid REFERENCES vacating_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS room_change_requests_to_bed_status_idx
  ON room_change_requests (to_bed_id, status);

DO $$ BEGIN
  CREATE TYPE room_transfer_hold_status AS ENUM ('active', 'released');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS room_transfer_bed_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bed_id uuid NOT NULL REFERENCES beds(id) ON DELETE RESTRICT,
  room_change_request_id uuid NOT NULL REFERENCES room_change_requests(id) ON DELETE CASCADE,
  status room_transfer_hold_status NOT NULL DEFAULT 'active',
  hold_from_date date NOT NULL,
  transfer_date date NOT NULL,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS room_transfer_bed_holds_active_bed_uidx
  ON room_transfer_bed_holds (bed_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS room_transfer_bed_holds_request_uidx
  ON room_transfer_bed_holds (room_change_request_id);

CREATE INDEX IF NOT EXISTS room_transfer_bed_holds_bed_status_idx
  ON room_transfer_bed_holds (bed_id, status);
