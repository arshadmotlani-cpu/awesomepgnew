import { and, desc, eq, sql } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import { acAssets, acExpenses } from '@/src/capital/db/schema';
import { postLedgerEntry, reverseSourceLedger } from './ledger';
import { logActivity } from './activity';
import { recalculateAsset } from './assets';
import { assertAssetAcceptsExpenses } from '@/src/capital/lib/assetLifecycle';

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
    await assertAssetAcceptsExpenses(input.assetId, tx);

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

export async function listExpenses(opts?: {
  assetId?: string;
  /** When false (default), hide expenses on sold/settled/cancelled vehicles */
  includeClosed?: boolean;
}) {
  const assetId = typeof opts === 'string' ? opts : opts?.assetId;
  const includeClosed = typeof opts === 'object' ? Boolean(opts?.includeClosed) : false;

  if (assetId) {
    return capitalDb
      .select()
      .from(acExpenses)
      .where(and(eq(acExpenses.assetId, assetId), eq(acExpenses.isReversed, false)))
      .orderBy(desc(acExpenses.expenseDate));
  }

  if (includeClosed) {
    return capitalDb
      .select()
      .from(acExpenses)
      .where(eq(acExpenses.isReversed, false))
      .orderBy(desc(acExpenses.expenseDate));
  }

  return capitalDb
    .select({
      id: acExpenses.id,
      assetId: acExpenses.assetId,
      categoryId: acExpenses.categoryId,
      expenseDate: acExpenses.expenseDate,
      vendor: acExpenses.vendor,
      amountPaise: acExpenses.amountPaise,
      description: acExpenses.description,
      paymentMethod: acExpenses.paymentMethod,
      notes: acExpenses.notes,
      isReversed: acExpenses.isReversed,
      createdAt: acExpenses.createdAt,
      updatedAt: acExpenses.updatedAt,
    })
    .from(acExpenses)
    .innerJoin(acAssets, eq(acExpenses.assetId, acAssets.id))
    .where(
      and(
        eq(acExpenses.isReversed, false),
        sql`${acAssets.status} NOT IN ('sold', 'settled', 'cancelled')`,
      ),
    )
    .orderBy(desc(acExpenses.expenseDate));
}
