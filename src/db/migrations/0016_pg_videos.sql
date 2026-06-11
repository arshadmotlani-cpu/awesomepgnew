ALTER TABLE "pgs" ADD COLUMN IF NOT EXISTS "videos" jsonb DEFAULT '[]'::jsonb NOT NULL;
