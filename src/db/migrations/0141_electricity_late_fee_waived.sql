-- Late fee waiver — operator/resident never saw bill before due date passed.
ALTER TABLE electricity_invoices
  ADD COLUMN IF NOT EXISTS late_fee_waived boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN electricity_invoices.late_fee_waived IS
  'When true, projectElectricityInvoice skips late-fee accrual until resident has seen the bill.';
