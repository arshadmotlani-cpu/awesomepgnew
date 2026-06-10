-- Phase 5.5 — Resident billing, electricity, deposits, vacating.
--
-- Adds the recurring-billing surface area on top of the existing booking +
-- payment + extension lifecycle. Five new tables, four new enums, two new
-- `payment_purpose` enum values, plus their indexes / constraints.
--
-- All changes are additive — no existing column / table / enum value is
-- modified. Pre-Phase-5.5 callers (booking, extension, refund, deposit
-- collection, customer cancellation, sweeper) keep working unchanged.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. New enums
-- ───────────────────────────────────────────────────────────────────────────

CREATE TYPE rent_invoice_status AS ENUM ('pending', 'paid', 'overdue', 'cancelled');
CREATE TYPE electricity_invoice_status AS ENUM ('pending', 'paid', 'cancelled');
CREATE TYPE deposit_entry_kind AS ENUM ('collected', 'deducted', 'refunded');
CREATE TYPE vacating_status AS ENUM ('pending', 'approved', 'completed', 'rejected');

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Extend payment_purpose so the payments ledger can carry rent +
--    electricity entries alongside the existing booking/extension/refund
--    rows. ADD VALUE is transaction-safe on Postgres 12+.
-- ───────────────────────────────────────────────────────────────────────────

ALTER TYPE payment_purpose ADD VALUE IF NOT EXISTS 'rent';
ALTER TYPE payment_purpose ADD VALUE IF NOT EXISTS 'electricity';
ALTER TYPE payment_purpose ADD VALUE IF NOT EXISTS 'deposit_deduction';

-- ───────────────────────────────────────────────────────────────────────────
-- 3. rent_invoices — one row per (booking, billing_month).
--
--    `billing_month` is always stored as the 1st of the month so an index
--    on it sorts chronologically. `due_date` is materialised (5th of the
--    month) so the late-fee computation doesn't have to do date math in SQL.
--    `late_fee_locked_paise` is the late fee snapshotted AT PAYMENT TIME —
--    after `paid_at` is set, the late fee stops accruing for accounting
--    even if the row sits unread for months.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE rent_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  bed_id uuid NOT NULL REFERENCES beds(id) ON DELETE RESTRICT,
  pg_id uuid NOT NULL REFERENCES pgs(id) ON DELETE RESTRICT,
  billing_month date NOT NULL,
  due_date date NOT NULL,
  rent_paise bigint NOT NULL,
  paid_principal_paise bigint NOT NULL DEFAULT 0,
  paid_late_fee_paise bigint NOT NULL DEFAULT 0,
  late_fee_locked_paise bigint,
  status rent_invoice_status NOT NULL DEFAULT 'pending',
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rent_invoices_invoice_number_unique UNIQUE (invoice_number),
  CONSTRAINT rent_invoices_booking_month_unique UNIQUE (booking_id, billing_month),
  CONSTRAINT rent_invoices_money_nonneg
    CHECK (rent_paise >= 0
       AND paid_principal_paise >= 0
       AND paid_late_fee_paise >= 0
       AND (late_fee_locked_paise IS NULL OR late_fee_locked_paise >= 0)),
  CONSTRAINT rent_invoices_billing_month_first_of_month
    CHECK (EXTRACT(DAY FROM billing_month) = 1)
);

CREATE INDEX rent_invoices_booking_idx ON rent_invoices (booking_id);
CREATE INDEX rent_invoices_customer_idx ON rent_invoices (customer_id);
CREATE INDEX rent_invoices_status_idx ON rent_invoices (status);
CREATE INDEX rent_invoices_due_date_idx ON rent_invoices (due_date)
  WHERE status IN ('pending', 'overdue');
CREATE INDEX rent_invoices_pg_month_idx ON rent_invoices (pg_id, billing_month);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. electricity_bills — one row per (room, billing_month).
--
--    Per-resident invoices fan out into electricity_invoices in the same
--    transaction so the bill is atomic. `monthly_occupant_count = 0`
--    bills are valid (no monthly residents in the room that month) — we
--    still record the bill so the operator can see they entered it.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE electricity_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pg_id uuid NOT NULL REFERENCES pgs(id) ON DELETE RESTRICT,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  billing_month date NOT NULL,
  units_consumed numeric(10,2) NOT NULL,
  rate_per_unit_paise bigint NOT NULL,
  total_paise bigint NOT NULL,
  monthly_occupant_count integer NOT NULL,
  per_resident_paise bigint NOT NULL,
  rounding_remainder_paise bigint NOT NULL DEFAULT 0,
  created_by_admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT electricity_bills_room_month_unique UNIQUE (room_id, billing_month),
  CONSTRAINT electricity_bills_money_nonneg
    CHECK (units_consumed >= 0
       AND rate_per_unit_paise >= 0
       AND total_paise >= 0
       AND monthly_occupant_count >= 0
       AND per_resident_paise >= 0
       AND rounding_remainder_paise >= 0),
  CONSTRAINT electricity_bills_month_first_of_month
    CHECK (EXTRACT(DAY FROM billing_month) = 1)
);

CREATE INDEX electricity_bills_pg_month_idx ON electricity_bills (pg_id, billing_month);
CREATE INDEX electricity_bills_room_idx ON electricity_bills (room_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. electricity_invoices — one row per (electricity_bill, booking) so
--    each monthly resident gets a separately payable invoice with a unique
--    invoice number.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE electricity_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  electricity_bill_id uuid NOT NULL REFERENCES electricity_bills(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  bed_id uuid NOT NULL REFERENCES beds(id) ON DELETE RESTRICT,
  billing_month date NOT NULL,
  amount_paise bigint NOT NULL,
  paid_paise bigint NOT NULL DEFAULT 0,
  status electricity_invoice_status NOT NULL DEFAULT 'pending',
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT electricity_invoices_invoice_number_unique UNIQUE (invoice_number),
  CONSTRAINT electricity_invoices_bill_booking_unique UNIQUE (electricity_bill_id, booking_id),
  CONSTRAINT electricity_invoices_money_nonneg
    CHECK (amount_paise >= 0 AND paid_paise >= 0)
);

CREATE INDEX electricity_invoices_booking_idx ON electricity_invoices (booking_id);
CREATE INDEX electricity_invoices_customer_idx ON electricity_invoices (customer_id);
CREATE INDEX electricity_invoices_status_idx ON electricity_invoices (status);
CREATE INDEX electricity_invoices_bill_idx ON electricity_invoices (electricity_bill_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 6. deposit_ledger — append-only ledger of every deposit-related entry.
--
--    Positive `amount_paise` for `collected`, negative for `deducted` /
--    `refunded`. The CHECK constraint makes that invariant enforceable at
--    the storage layer so a bug in service code can't write a
--    sign-reversed row and silently corrupt the per-booking deposit
--    balance.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE deposit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  entry_kind deposit_entry_kind NOT NULL,
  amount_paise bigint NOT NULL,
  reason text NOT NULL,
  related_payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  related_vacating_id uuid,
  created_by_admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deposit_ledger_sign_matches_kind
    CHECK (
      (entry_kind = 'collected' AND amount_paise > 0)
      OR (entry_kind IN ('deducted', 'refunded') AND amount_paise < 0)
    )
);

CREATE INDEX deposit_ledger_booking_idx ON deposit_ledger (booking_id);
CREATE INDEX deposit_ledger_customer_idx ON deposit_ledger (customer_id);
CREATE INDEX deposit_ledger_kind_idx ON deposit_ledger (entry_kind);

-- ───────────────────────────────────────────────────────────────────────────
-- 7. vacating_requests — one row per (booking) outstanding request.
--
--    `notice_compliant` + `deduction_paise` are computed at submit-time
--    against the policy (15 days notice = no deduction; less = fixed
--    5-day rent penalty) and snapshotted onto the row, so a later policy
--    change can't silently rewrite the deduction owed by past requests.
--    The actual deposit_ledger 'deducted' + 'refunded' entries are written
--    when the admin marks the request `completed`.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE vacating_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  notice_given_date date NOT NULL,
  vacating_date date NOT NULL,
  notice_compliant boolean NOT NULL,
  deduction_paise bigint NOT NULL DEFAULT 0,
  deposit_refund_paise bigint NOT NULL DEFAULT 0,
  monthly_rent_paise_snapshot bigint NOT NULL,
  status vacating_status NOT NULL DEFAULT 'pending',
  resolved_at timestamptz,
  resolved_by_admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vacating_requests_one_open_per_booking
    UNIQUE (booking_id),
  CONSTRAINT vacating_requests_money_nonneg
    CHECK (deduction_paise >= 0
       AND deposit_refund_paise >= 0
       AND monthly_rent_paise_snapshot >= 0),
  CONSTRAINT vacating_requests_vacating_after_notice
    CHECK (vacating_date >= notice_given_date)
);

CREATE INDEX vacating_requests_booking_idx ON vacating_requests (booking_id);
CREATE INDEX vacating_requests_status_idx ON vacating_requests (status);

-- Late-binding FK from deposit_ledger.related_vacating_id (we couldn't
-- create it in step 6 because vacating_requests didn't exist yet).
ALTER TABLE deposit_ledger
  ADD CONSTRAINT deposit_ledger_related_vacating_fk
  FOREIGN KEY (related_vacating_id)
  REFERENCES vacating_requests(id)
  ON DELETE SET NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 8. updated_at triggers on the mutable tables. The set_updated_at()
--    function was created in 0001_constraints.sql.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TRIGGER rent_invoices_set_updated_at
  BEFORE UPDATE ON rent_invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER electricity_bills_set_updated_at
  BEFORE UPDATE ON electricity_bills
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER electricity_invoices_set_updated_at
  BEFORE UPDATE ON electricity_invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER vacating_requests_set_updated_at
  BEFORE UPDATE ON vacating_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
