export const FYH_EXPENSE_CATEGORIES = [
  'general',
  'utilities',
  'maintenance',
  'inventory_purchase',
  'vendor_payment',
  'marketing',
  'salary',
  'rent',
  'travel',
  'food_pantry',
  'equipment',
  'taxes',
  'other',
] as const;

export type FyhExpenseCategory = (typeof FYH_EXPENSE_CATEGORIES)[number];

export const FYH_EXPENSE_CATEGORY_LABELS: Record<FyhExpenseCategory, string> = {
  general: 'General',
  utilities: 'Utilities',
  maintenance: 'Maintenance',
  inventory_purchase: 'Inventory Purchase',
  vendor_payment: 'Vendor Payment',
  marketing: 'Marketing',
  salary: 'Salary',
  rent: 'Rent',
  travel: 'Travel',
  food_pantry: 'Food & Pantry',
  equipment: 'Equipment',
  taxes: 'Taxes',
  other: 'Other',
};

export const FYH_EXPENSE_PAYMENT_METHODS = ['cash', 'online', 'petty_cash'] as const;
export type FyhExpensePaymentMethod = (typeof FYH_EXPENSE_PAYMENT_METHODS)[number];

export const FYH_EXPENSE_PAYMENT_LABELS: Record<FyhExpensePaymentMethod, string> = {
  cash: 'Cash',
  online: 'Online',
  petty_cash: 'Petty Cash',
};

export function parseExpenseCategory(raw: string): FyhExpenseCategory {
  if ((FYH_EXPENSE_CATEGORIES as readonly string[]).includes(raw)) {
    return raw as FyhExpenseCategory;
  }
  return 'other';
}

export function parseExpensePaymentMethod(raw: string): FyhExpensePaymentMethod {
  if (raw === 'online' || raw === 'petty_cash') return raw;
  return 'cash';
}
