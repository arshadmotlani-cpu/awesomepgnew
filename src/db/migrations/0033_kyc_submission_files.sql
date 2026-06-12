-- Persist KYC images in Postgres for serverless (Vercel) where local disk is read-only.
CREATE TABLE IF NOT EXISTS "kyc_submission_files" (
  "submission_id" uuid NOT NULL REFERENCES "kyc_submissions"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "mime" text NOT NULL,
  "content" bytea NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "kyc_submission_files_submission_kind_unique" UNIQUE ("submission_id", "kind")
);

CREATE INDEX IF NOT EXISTS "kyc_submission_files_submission_id_idx"
  ON "kyc_submission_files" ("submission_id");
