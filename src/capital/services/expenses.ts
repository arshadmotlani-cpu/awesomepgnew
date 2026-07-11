import { and, eq } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import { acExpenses } from '@/src/capital/db/schema';
import { postLedgerEntry, reverseSourceLedger } from './ledger';
import { logActivity } from './activity';
import { assertAssetMutable, recalculateAsset } from './assets';

export type CreateExpenseInput = {
  assetId: string;
  categoryId: string;
  expenseDate: string;
  vendor?: string;
  amountPaise: number;
  description: string;
  paymentMethod?: string;
  notes?: string;
};

export async function createExpense(input: CreateExpenseInput) {
  if (input.amountPaise <= 0) throw new Error('Expense amount must be positive');

  return capitalDb.transaction(async (tx) => {
    await assertAssetMutable(input.assetId, tx);

    const [row] = await tx
      .insert(acExpenses)
      .values({
        assetId: input.assetId,
        categoryId: input.categoryId,
        expenseDate: input.expenseDate,
        vendor: input.vendor,
        amountPaise: input.amountPaise,
        description: input.description,
        paymentMethod: input.paymentMethod as typeof acExpenses.$inferInsert.paymentMethod,
        notes: input.notes,
      })
      .returning();

    await postLedgerEntry(
      {
        entryType: 'expense',
        direction: 'debit',
        amountPaise: input.amountPaise,
        assetId: input.assetId,
        sourceTable: 'ac_expenses',
        sourceId: row.id,
        description: `Expense: ${input.description}`,
      },
      tx,
    );

    await recalculateAsset(input.assetId, tx);
    await logActivity(
      {
        action: 'expense_created',
        entityType: 'expense',
        entityId: row.id,
        afterState: { amountPaise: input.amountPaise, assetId: input.assetId },
      },
      tx,
    );

    return row;
  });
}

export async function reverseExpense(expenseId: string, reason: string) {
  return capitalDb.transaction(async (tx) => {
    const [updated] = await tx
      .update(acExpenses)
      .set({ isReversed: true, updatedAt: new Date() })
      .where(and(eq(acExpenses.id, expenseId), eq(acExpenses.isReversed, false)))
      .returning();

    if (!updated) throw new Error('Expense not found or already reversed');

    await reverseSourceLedger(
      'ac_expenses',
      expenseId,
      `Reversal: ${reason}`,
      tx,
      'expense',
    );

    await recalculateAsset(updated.assetId, tx);
    await logActivity(
      {
        action: 'expense_reversed',
        entityType: 'expense',
        entityId: expenseId,
        afterState: { reason },
      },
      tx,
    );
  });
}

export async function listExpenses(assetId?: string) {
  if (assetId) {
    return capitalDb
      .select()
      .from(acExpenses)
      .where(and(eq(acExpenses.assetId, assetId), eq(acExpenses.isReversed, false)))
      .orderBy(acExpenses.expenseDate);
  }
  return capitalDb
    .select()
    .from(acExpenses)
    .where(eq(acExpenses.isReversed, false))
    .orderBy(acExpenses.expenseDate);
}
