-- Unified checkout settlement workflow for vacating residents.

CREATE TYPE checkout_settlement_status AS ENUM (
  'awaiting_resident_details',
  'awaiting_admin_review',
  'approved',
  'refund_pending',
  'refund_paid',
  'completed'
);

CREATE TABLE checkout_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vacating_request_id uuid NOT NULL UNIQUE REFERENCES vacating_requests(id) ON DELETE RESTRICT,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,

  status checkout_settlement_status NOT NULL DEFAULT 'awaiting_resident_details',

  notice_required_days integer NOT NULL DEFAULT 14,
  notice_given_days integer NOT NULL DEFAULT 0,
  notice_shortfall_days integer NOT NULL DEFAULT 0,
  notice_deduction_paise bigint NOT NULL DEFAULT 0,
  monthly_rent_paise_snapshot bigint NOT NULL DEFAULT 0,
  deposit_required_paise bigint NOT NULL DEFAULT 0,

  electricity_meter_photo_url text,
  electricity_use_average boolean NOT NULL DEFAULT false,
  electricity_previous_reading numeric(12, 2),
  electricity_current_reading numeric(12, 2),
  electricity_units numeric(12, 2),
  electricity_occupants integer,
  electricity_unit_rate_paise bigint,
  electricity_share_paise bigint NOT NULL DEFAULT 0,

  damage_charge_paise bigint NOT NULL DEFAULT 0,
  cleaning_charge_paise bigint NOT NULL DEFAULT 0,
  custom_charge_paise bigint NOT NULL DEFAULT 0,
  custom_charge_label text,

  payout_upi_id text,
  payout_qr_url text,

  deductions_snapshot jsonb,
  final_refund_paise bigint,
  amounts_locked boolean NOT NULL DEFAULT false,

  refund_method text,
  refund_reference text,
  refund_notes text,
  refund_paid_at timestamptz,

  approved_at timestamptz,
  approved_by_admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  refund_paid_by_admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  deposit_settlement_id uuid REFERENCES deposit_settlements(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX checkout_settlements_status_idx ON checkout_settlements (status, updated_at DESC);
CREATE INDEX checkout_settlements_booking_idx ON checkout_settlements (booking_id);
CREATE INDEX checkout_settlements_customer_idx ON checkout_settlements (customer_id);
