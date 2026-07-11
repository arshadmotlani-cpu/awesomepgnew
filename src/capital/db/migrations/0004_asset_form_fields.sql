-- Asset form fields: fuel type, ownership; registration optional

DO $$ BEGIN
  CREATE TYPE ac_fuel_type AS ENUM ('petrol', 'diesel', 'cng', 'ev', 'hybrid');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ac_ownership AS ENUM ('first_owner', 'second_owner', 'third_owner');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE ac_automotive_details
  ALTER COLUMN registration_number DROP NOT NULL;

ALTER TABLE ac_automotive_details
  ADD COLUMN IF NOT EXISTS fuel_type ac_fuel_type,
  ADD COLUMN IF NOT EXISTS ownership ac_ownership;
