-- Signup sessions — temporary state until password is created (no partial customer rows).

CREATE TABLE signup_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  email citext NOT NULL,
  full_name text,
  phone text,
  otp_verified boolean DEFAULT false NOT NULL,
  profile_submitted boolean DEFAULT false NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT signup_sessions_status_check CHECK (status IN ('pending', 'completed', 'expired'))
);

CREATE INDEX signup_sessions_email_idx ON signup_sessions (email);
CREATE INDEX signup_sessions_status_expires_idx ON signup_sessions (status, expires_at);
