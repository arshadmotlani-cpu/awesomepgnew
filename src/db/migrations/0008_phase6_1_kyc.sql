-- Phase 6.1 — resident KYC workflow.
ALTER TYPE kyc_status RENAME VALUE 'verified' TO 'approved';

CREATE TYPE kyc_submission_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE kyc_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  aadhaar_front_path text NOT NULL,
  aadhaar_back_path text NOT NULL,
  selfie_path text NOT NULL,
  status kyc_submission_status NOT NULL DEFAULT 'pending',
  rejection_reason text,
  validation_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by_admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX kyc_submissions_customer_idx ON kyc_submissions (customer_id, created_at DESC);
CREATE INDEX kyc_submissions_status_idx ON kyc_submissions (status, created_at DESC);

ALTER TABLE customers
  ADD COLUMN profile_completed_at timestamptz;
