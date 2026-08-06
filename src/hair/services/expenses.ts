import { desc, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhExpenses } from '@/src/hair/db/schema';
import type { FyhExpenseCategory, FyhExpensePaymentMethod } from '@/src/hair/lib/expenseCategories';

export type ExpenseInput = {
  title: string;
  category: FyhExpenseCategory;
  expenseDate: string;
  amountRupees: number;
  paymentMethod: FyhExpensePaymentMethod;
  attachmentUrl?: string | null;
  notes?: string | null;
  staffName: string;
  staffEmployeeId?: string | null;
};

export async function listExpenses(limit = 200) {
  return hairDb
    .select()
    .from(fyhExpenses)
    .orderBy(desc(fyhExpenses.expenseDate), desc(fyhExpenses.createdAt))
    .limit(limit);
}

export async function createExpense(input: ExpenseInput) {
  const title = input.title.trim();
  if (!title) throw new Error('Title is required');
  if (input.amountRupees < 0) throw new Error('Amount cannot be negative');
  const [row] = await hairDb
    .insert(fyhExpenses)
    .values({
      title,
      category: input.category,
      expenseDate: input.expenseDate,
      amountPaise: Math.round(input.amountRupees * 100),
      paymentMethod: input.paymentMethod,
      attachmentUrl: input.attachmentUrl ?? null,
      notes: input.notes?.trim() || null,
      staffName: input.staffName.trim(),
      staffEmployeeId: input.staffEmployeeId ?? null,
    })
    .returning();
  return row!;
}

export async function deleteExpense(id: string) {
  await hairDb.delete(fyhExpenses).where(eq(fyhExpenses.id, id));
}
