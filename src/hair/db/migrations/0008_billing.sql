-- Billing foundation: invoices, lines, payments, credit notes + appointment invoice FK
-- Also creates inventory movements + commission entries so Phase 2+ can wire side effects.

CREATE TABLE IF NOT EXISTS fyh_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  customer_id uuid NOT NULL REFERENCES fyh_customers(id) ON DELETE RESTRICT,
  appointment_id uuid REFERENCES fyh_appointments(id) ON DELETE SET NULL,
  stylist_id uuid REFERENCES fyh_staff(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  subtotal_paise bigint NOT NULL DEFAULT 0,
  discount_paise bigint NOT NULL DEFAULT 0,
  tax_paise bigint NOT NULL DEFAULT 0,
  grand_total_paise bigint NOT NULL DEFAULT 0,
  amount_paid_paise bigint NOT NULL DEFAULT 0,
  membership_redemption_paise bigint NOT NULL DEFAULT 0,
  package_redemption_paise bigint NOT NULL DEFAULT 0,
  wallet_redemption_paise bigint NOT NULL DEFAULT 0,
  gift_card_redemption_paise bigint NOT NULL DEFAULT 0,
  notes text,
  paid_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fyh_invoices_status_check CHECK (
    status IN ('draft', 'unpaid', 'partial', 'paid', 'void', 'refunded')
  ),
  CONSTRAINT fyh_invoices_money_nonneg_check CHECK (
    subtotal_paise >= 0
    AND discount_paise >= 0
    AND tax_paise >= 0
    AND grand_total_paise >= 0
    AND amount_paid_paise >= 0
    AND membership_redemption_paise >= 0
    AND package_redemption_paise >= 0
    AND wallet_redemption_paise >= 0
    AND gift_card_redemption_paise >= 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS fyh_invoices_number_uidx ON fyh_invoices (invoice_number);
CREATE UNIQUE INDEX IF NOT EXISTS fyh_invoices_appointment_uidx
  ON fyh_invoices (appointment_id)
  WHERE appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fyh_invoices_customer_idx ON fyh_invoices (customer_id, created_at);
CREATE INDEX IF NOT EXISTS fyh_invoices_status_idx ON fyh_invoices (status);
CREATE INDEX IF NOT EXISTS fyh_invoices_stylist_idx ON fyh_invoices (stylist_id);
CREATE INDEX IF NOT EXISTS fyh_invoices_created_idx ON fyh_invoices (created_at);

CREATE SEQUENCE IF NOT EXISTS fyh_invoice_number_seq;

COMMENT ON TABLE fyh_invoices IS 'Salon invoices — single checkout money engine (paise)';

CREATE TABLE IF NOT EXISTS fyh_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES fyh_invoices(id) ON DELETE CASCADE,
  kind text NOT NULL,
  service_id uuid REFERENCES fyh_services(id) ON DELETE SET NULL,
  product_id uuid REFERENCES fyh_products(id) ON DELETE SET NULL,
  package_id uuid,
  membership_id uuid,
  staff_id uuid REFERENCES fyh_staff(id) ON DELETE SET NULL,
  name_snapshot text NOT NULL,
  quantity numeric(12, 3) NOT NULL DEFAULT 1,
  unit_price_paise bigint NOT NULL DEFAULT 0,
  discount_paise bigint NOT NULL DEFAULT 0,
  gst_bps integer NOT NULL DEFAULT 0,
  tax_paise bigint NOT NULL DEFAULT 0,
  line_total_paise bigint NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fyh_invoice_lines_kind_check CHECK (
    kind IN ('service', 'product', 'package', 'membership', 'custom')
  ),
  CONSTRAINT fyh_invoice_lines_qty_positive CHECK (quantity > 0),
  CONSTRAINT fyh_invoice_lines_money_nonneg_check CHECK (
    unit_price_paise >= 0
    AND discount_paise >= 0
    AND gst_bps >= 0
    AND tax_paise >= 0
    AND line_total_paise >= 0
  )
);

CREATE INDEX IF NOT EXISTS fyh_invoice_lines_invoice_idx
  ON fyh_invoice_lines (invoice_id, sort_order);
CREATE INDEX IF NOT EXISTS fyh_invoice_lines_staff_idx ON fyh_invoice_lines (staff_id);
CREATE INDEX IF NOT EXISTS fyh_invoice_lines_service_idx ON fyh_invoice_lines (service_id);
CREATE INDEX IF NOT EXISTS fyh_invoice_lines_product_idx ON fyh_invoice_lines (product_id);

CREATE TABLE IF NOT EXISTS fyh_invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES fyh_invoices(id) ON DELETE CASCADE,
  method text NOT NULL,
  amount_paise bigint NOT NULL,
  reference text,
  notes text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fyh_invoice_payments_method_check CHECK (
    method IN ('cash', 'upi', 'card', 'wallet', 'gift_card')
  ),
  CONSTRAINT fyh_invoice_payments_amount_positive CHECK (amount_paise > 0)
);

CREATE INDEX IF NOT EXISTS fyh_invoice_payments_invoice_idx
  ON fyh_invoice_payments (invoice_id, paid_at);
CREATE INDEX IF NOT EXISTS fyh_invoice_payments_method_idx ON fyh_invoice_payments (method);

CREATE TABLE IF NOT EXISTS fyh_credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_number text NOT NULL,
  invoice_id uuid NOT NULL REFERENCES fyh_invoices(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES fyh_customers(id) ON DELETE RESTRICT,
  amount_paise bigint NOT NULL,
  reason text,
  notes text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fyh_credit_notes_amount_positive CHECK (amount_paise > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS fyh_credit_notes_number_uidx
  ON fyh_credit_notes (credit_note_number);
CREATE INDEX IF NOT EXISTS fyh_credit_notes_invoice_idx ON fyh_credit_notes (invoice_id);
CREATE INDEX IF NOT EXISTS fyh_credit_notes_customer_idx
  ON fyh_credit_notes (customer_id, issued_at);

CREATE SEQUENCE IF NOT EXISTS fyh_credit_note_number_seq;

COMMENT ON TABLE fyh_credit_notes IS 'Credit notes / refunds linked to salon invoices';

-- Promote appointments.invoice_id from text → uuid FK now that fyh_invoices exists
ALTER TABLE fyh_appointments
  ALTER COLUMN invoice_id TYPE uuid USING (
    CASE
      WHEN invoice_id IS NULL OR btrim(invoice_id) = '' THEN NULL
      WHEN invoice_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN invoice_id::uuid
      ELSE NULL
    END
  );

DO $$ BEGIN
  ALTER TABLE fyh_appointments
    ADD CONSTRAINT fyh_appointments_invoice_fk
    FOREIGN KEY (invoice_id) REFERENCES fyh_invoices(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Inventory ledger (Phase 3 wiring; table created now for side-effect hooks)
CREATE TABLE IF NOT EXISTS fyh_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES fyh_products(id) ON DELETE RESTRICT,
  movement_type text NOT NULL,
  quantity_delta numeric(12, 3) NOT NULL,
  quantity_after numeric(12, 3),
  reference_type text,
  reference_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fyh_stock_movements_type_check CHECK (
    movement_type IN (
      'opening',
      'purchase',
      'sale',
      'consumption',
      'adjustment',
      'return',
      'transfer'
    )
  ),
  CONSTRAINT fyh_stock_movements_delta_nonzero CHECK (quantity_delta <> 0)
);

CREATE INDEX IF NOT EXISTS fyh_stock_movements_product_idx
  ON fyh_stock_movements (product_id, created_at);
CREATE INDEX IF NOT EXISTS fyh_stock_movements_type_idx ON fyh_stock_movements (movement_type);
CREATE INDEX IF NOT EXISTS fyh_stock_movements_reference_idx
  ON fyh_stock_movements (reference_type, reference_id);

COMMENT ON TABLE fyh_stock_movements IS 'Append-only product stock ledger — product qty lives on fyh_products';

-- Commission ledger (Phase 4 engine; pending rows enqueued on invoice paid)
CREATE TABLE IF NOT EXISTS fyh_commission_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_line_id uuid NOT NULL REFERENCES fyh_invoice_lines(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES fyh_staff(id) ON DELETE RESTRICT,
  amount_paise bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  period_date date NOT NULL,
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fyh_commission_entries_status_check CHECK (status IN ('pending', 'paid')),
  CONSTRAINT fyh_commission_entries_amount_nonneg CHECK (amount_paise >= 0)
);

CREATE INDEX IF NOT EXISTS fyh_commission_entries_staff_period_idx
  ON fyh_commission_entries (staff_id, period_date);
CREATE INDEX IF NOT EXISTS fyh_commission_entries_status_idx ON fyh_commission_entries (status);
CREATE INDEX IF NOT EXISTS fyh_commission_entries_line_idx ON fyh_commission_entries (invoice_line_id);

COMMENT ON TABLE fyh_commission_entries IS 'Staff commission from paid invoice lines (pending|paid)';
