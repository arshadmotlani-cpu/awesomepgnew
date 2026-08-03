-- Super Admin resident impersonation audit + active session tracking.

CREATE TYPE admin_impersonation_status AS ENUM ('active', 'ended', 'failed');

CREATE TABLE admin_resident_impersonations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admin_users(id),
  admin_session_id UUID REFERENCES auth_sessions(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  customer_session_id UUID REFERENCES auth_sessions(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  pg_id UUID REFERENCES pgs(id) ON DELETE SET NULL,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  bed_id UUID REFERENCES beds(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  status admin_impersonation_status NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  exit_reason TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  failure_reason TEXT,
  ip TEXT,
  user_agent TEXT,
  device_label TEXT,
  browser TEXT,
  operating_system TEXT,
  request_id TEXT,
  admin_return_path TEXT NOT NULL DEFAULT '/admin/residents',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX admin_resident_impersonations_admin_idx
  ON admin_resident_impersonations (admin_id, started_at DESC);

CREATE INDEX admin_resident_impersonations_customer_idx
  ON admin_resident_impersonations (customer_id, started_at DESC);

CREATE INDEX admin_resident_impersonations_active_admin_idx
  ON admin_resident_impersonations (admin_id)
  WHERE status = 'active';

CREATE INDEX admin_resident_impersonations_customer_session_idx
  ON admin_resident_impersonations (customer_session_id)
  WHERE status = 'active';
