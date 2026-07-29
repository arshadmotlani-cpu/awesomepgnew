-- Appointments foundation: resources, staff schedules, appointments, appointment services

CREATE TABLE IF NOT EXISTS fyh_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL,
  color text,
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fyh_resources_type_check CHECK (
    type IN (
      'chair',
      'vip_chair',
      'wash_station',
      'makeup_room',
      'bridal_room',
      'facial_room',
      'nail_station'
    )
  )
);

CREATE INDEX IF NOT EXISTS fyh_resources_active_idx ON fyh_resources (is_active);
CREATE INDEX IF NOT EXISTS fyh_resources_type_idx ON fyh_resources (type);
CREATE INDEX IF NOT EXISTS fyh_resources_sort_order_idx ON fyh_resources (sort_order, name);

COMMENT ON TABLE fyh_resources IS 'Salon chairs/rooms for calendar resource lanes and booking conflicts';

CREATE TABLE IF NOT EXISTS fyh_staff_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES fyh_staff(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL,
  start_time text NOT NULL DEFAULT '10:00',
  end_time text NOT NULL DEFAULT '19:00',
  lunch_start text,
  lunch_end text,
  is_off boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fyh_staff_schedules_dow_check CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT fyh_staff_schedules_time_format_check CHECK (
    start_time ~ '^\d{2}:\d{2}$'
    AND end_time ~ '^\d{2}:\d{2}$'
    AND (lunch_start IS NULL OR lunch_start ~ '^\d{2}:\d{2}$')
    AND (lunch_end IS NULL OR lunch_end ~ '^\d{2}:\d{2}$')
  ),
  CONSTRAINT fyh_staff_schedules_staff_dow_uidx UNIQUE (staff_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS fyh_staff_schedules_staff_idx
  ON fyh_staff_schedules (staff_id, day_of_week);

COMMENT ON TABLE fyh_staff_schedules IS 'Weekly stylist working hours (0=Sun … 6=Sat); HH:MM local salon time';

CREATE TABLE IF NOT EXISTS fyh_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES fyh_customers(id) ON DELETE RESTRICT,
  staff_id uuid NOT NULL REFERENCES fyh_staff(id) ON DELETE RESTRICT,
  resource_id uuid REFERENCES fyh_resources(id) ON DELETE SET NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'booked',
  notes text,
  source text NOT NULL DEFAULT 'booking',
  buffer_minutes integer NOT NULL DEFAULT 0,
  -- Opaque until 0008_billing promotes to uuid FK on fyh_invoices
  invoice_id text,
  recurrence_parent_id uuid,
  created_by_admin_id uuid REFERENCES fyh_admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fyh_appointments_status_check CHECK (
    status IN (
      'booked',
      'confirmed',
      'arrived',
      'in_service',
      'completed',
      'cancelled',
      'no_show',
      'paid'
    )
  ),
  CONSTRAINT fyh_appointments_source_check CHECK (
    source IN ('booking', 'walk_in')
  ),
  CONSTRAINT fyh_appointments_time_order_check CHECK (end_at > start_at),
  CONSTRAINT fyh_appointments_buffer_nonneg_check CHECK (buffer_minutes >= 0)
);

-- Self-FK for recurring series parent (nullable; set null if parent removed)
DO $$ BEGIN
  ALTER TABLE fyh_appointments
    ADD CONSTRAINT fyh_appointments_recurrence_parent_fk
    FOREIGN KEY (recurrence_parent_id) REFERENCES fyh_appointments(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS fyh_appointments_staff_time_idx
  ON fyh_appointments (staff_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS fyh_appointments_resource_time_idx
  ON fyh_appointments (resource_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS fyh_appointments_start_at_idx
  ON fyh_appointments (start_at);
CREATE INDEX IF NOT EXISTS fyh_appointments_customer_idx
  ON fyh_appointments (customer_id, start_at);
CREATE INDEX IF NOT EXISTS fyh_appointments_status_idx
  ON fyh_appointments (status);
CREATE INDEX IF NOT EXISTS fyh_appointments_invoice_idx
  ON fyh_appointments (invoice_id);
CREATE INDEX IF NOT EXISTS fyh_appointments_recurrence_idx
  ON fyh_appointments (recurrence_parent_id);

COMMENT ON TABLE fyh_appointments IS 'Salon appointments — visit lifecycle for calendar + checkout';

CREATE TABLE IF NOT EXISTS fyh_appointment_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES fyh_appointments(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES fyh_services(id) ON DELETE RESTRICT,
  name_snapshot text NOT NULL,
  duration_minutes integer NOT NULL,
  price_paise bigint NOT NULL DEFAULT 0,
  gst_bps integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fyh_appointment_services_duration_positive CHECK (duration_minutes > 0),
  CONSTRAINT fyh_appointment_services_price_nonneg CHECK (price_paise >= 0),
  CONSTRAINT fyh_appointment_services_gst_nonneg CHECK (gst_bps >= 0)
);

CREATE INDEX IF NOT EXISTS fyh_appointment_services_appointment_idx
  ON fyh_appointment_services (appointment_id, sort_order);
CREATE INDEX IF NOT EXISTS fyh_appointment_services_service_idx
  ON fyh_appointment_services (service_id);

COMMENT ON TABLE fyh_appointment_services IS 'Service line snapshots frozen at booking time';
