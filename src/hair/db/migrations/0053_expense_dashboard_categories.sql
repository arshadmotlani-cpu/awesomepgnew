-- Align manual expenses with the revenue dashboard category, payer, and tender lists.
-- Existing rows are remapped. Salary stays salary (payroll), not a general category.

UPDATE fyh_expenses SET category = 'stock_purchase' WHERE category = 'inventory_purchase';
UPDATE fyh_expenses SET category = 'foods_beverage' WHERE category = 'food_pantry';
UPDATE fyh_expenses SET category = 'bill' WHERE category IN ('utilities', 'rent', 'taxes');
UPDATE fyh_expenses SET category = 'other' WHERE category IN ('vendor_payment', 'marketing', 'travel', 'equipment');

UPDATE fyh_expenses SET paid_by = 'salon' WHERE paid_by = 'business_cash';
UPDATE fyh_expenses SET paid_by = 'other' WHERE paid_by = 'petty_cash';

UPDATE fyh_expenses SET payment_method = 'upi' WHERE payment_method = 'online';
UPDATE fyh_expenses SET payment_method = 'cash' WHERE payment_method = 'petty_cash';

CREATE TABLE IF NOT EXISTS fyh_expense_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  expense_id uuid NOT NULL REFERENCES fyh_expenses(id) ON DELETE CASCADE,
  url text NOT NULL,
  content_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fyh_expense_attachments_expense_idx
  ON fyh_expense_attachments (expense_id);
