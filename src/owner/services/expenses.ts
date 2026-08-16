import { paiseFromRupees, type ExpenseCategory } from '@/src/owner/lib/wealth/types';
import { createJournalEntry } from '@/src/owner/services/journal';

export async function createManualExpense(input: {
  amountRupees: number;
  expenseDate: string;
  description: string;
  category: ExpenseCategory;
  subcategory?: string | null;
  accountId?: string | null;
  assetId?: string | null;
  liabilityId?: string | null;
  businessId?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}) {
  const amountPaise = paiseFromRupees(input.amountRupees);
  if (amountPaise <= 0) throw new Error('Expense amount must be positive');

  const { entry } = await createJournalEntry({
    entryDate: input.expenseDate,
    description: input.description.trim(),
    eventType: 'EXPENSE',
    sourceSystem: 'OWNER_OS',
    createdBy: input.createdBy,
    lines: [
      {
        amountPaise,
        eventType: 'EXPENSE',
        category: input.category,
        subcategory: input.subcategory ?? null,
        accountId: input.accountId ?? null,
        assetId: input.assetId ?? null,
        liabilityId: input.liabilityId ?? null,
        businessId: input.businessId ?? null,
        notes: input.notes ?? null,
      },
    ],
  });

  return entry;
}

export async function createManualIncome(input: {
  amountRupees: number;
  incomeDate: string;
  description: string;
  accountId?: string | null;
  assetId?: string | null;
  businessId?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}) {
  const amountPaise = paiseFromRupees(input.amountRupees);
  if (amountPaise <= 0) throw new Error('Income amount must be positive');

  const { entry } = await createJournalEntry({
    entryDate: input.incomeDate,
    description: input.description.trim(),
    eventType: 'INCOME',
    sourceSystem: 'OWNER_OS',
    createdBy: input.createdBy,
    lines: [
      {
        amountPaise,
        eventType: 'INCOME',
        accountId: input.accountId ?? null,
        assetId: input.assetId ?? null,
        businessId: input.businessId ?? null,
        notes: input.notes ?? null,
      },
    ],
  });

  return entry;
}
