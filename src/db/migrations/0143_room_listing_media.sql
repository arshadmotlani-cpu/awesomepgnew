-- Room-level listing media (public description, photos, videos, dimensions).
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS listing_description text;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS videos jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS dimensions jsonb NOT NULL DEFAULT '{}'::jsonb;
