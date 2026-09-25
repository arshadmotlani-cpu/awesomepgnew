export const FYH_EXPENSE_FOR = ['guest', 'vendor', 'organization', 'personal'] as const;
export type FyhExpenseFor = (typeof FYH_EXPENSE_FOR)[number];

export const FYH_EXPENSE_PAID_BY = ['staff', 'business_cash', 'petty_cash'] as const;
export type FyhExpensePaidBy = (typeof FYH_EXPENSE_PAID_BY)[number];

export const FYH_EXPENSE_SOURCES = ['manual', 'purchase'] as const;
export type FyhExpenseSource = (typeof FYH_EXPENSE_SOURCES)[number];

export const FYH_EXPENSE_STATUSES = ['active', 'cancelled'] as const;
export type FyhExpenseStatus = (typeof FYH_EXPENSE_STATUSES)[number];

export const FYH_EXPENSE_FOR_LABELS: Record<FyhExpenseFor, string> = {
  guest: 'Guest',
  vendor: 'Vendor',
  organization: 'Organization',
  personal: 'Personal',
};

export const FYH_EXPENSE_PAID_BY_LABELS: Record<FyhExpensePaidBy, string> = {
  staff: 'Staff',
  business_cash: 'Business Cash',
  petty_cash: 'Petty Cash',
};

export const FYH_EXPENSE_SOURCE_LABELS: Record<FyhExpenseSource, string> = {
  manual: 'Manual',
  purchase: 'Purchase / Inventory',
};

export const EXPENSE_FIELD_MAX = {
  billNumber: 64,
  companyName: 200,
  referenceId: 128,
  notes: 4000,
  title: 200,
} as const;

export function parseExpenseFor(raw: string): FyhExpenseFor | null {
  return (FYH_EXPENSE_FOR as readonly string[]).includes(raw) ? (raw as FyhExpenseFor) : null;
}

export function parseExpensePaidBy(raw: string): FyhExpensePaidBy | null {
  return (FYH_EXPENSE_PAID_BY as readonly string[]).includes(raw)
    ? (raw as FyhExpensePaidBy)
    : null;
}
