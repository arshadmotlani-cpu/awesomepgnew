-- KYC images belong in object storage (Cloudinary), not Postgres bytea blobs.
DROP TABLE IF EXISTS "kyc_submission_files";

ALTER TABLE "kyc_submissions"
  ADD COLUMN IF NOT EXISTS "aadhaar_front_mime" text,
  ADD COLUMN IF NOT EXISTS "aadhaar_back_mime" text,
  ADD COLUMN IF NOT EXISTS "selfie_mime" text;
