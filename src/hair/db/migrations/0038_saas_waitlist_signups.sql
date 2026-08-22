-- Isolated SaaS marketing waitlist. No FKs to salon operational tables.

CREATE TABLE IF NOT EXISTS saas_waitlist_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_name text NOT NULL,
  owner_name text NOT NULL,
  email text NOT NULL,
  phone text,
  city text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS saas_waitlist_signups_email_uidx
  ON saas_waitlist_signups (lower(email));
