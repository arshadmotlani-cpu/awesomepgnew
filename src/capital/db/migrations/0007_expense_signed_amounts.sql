-- Allow signed expense amounts (refunds / credits / adjustments reduce vehicle cost)
ALTER TABLE ac_expenses DROP CONSTRAINT IF EXISTS ac_expenses_amount_positive;
ALTER TABLE ac_expenses ADD CONSTRAINT ac_expenses_amount_nonzero CHECK (amount_paise <> 0);

-- Expense Adjustment category for negative cost ledger entries
INSERT INTO ac_categories (slug, label, kind, is_system, sort_order)
SELECT 'expense_adjustment', 'Expense Adjustment', 'expense', true, 14
WHERE NOT EXISTS (SELECT 1 FROM ac_categories WHERE slug = 'expense_adjustment');
