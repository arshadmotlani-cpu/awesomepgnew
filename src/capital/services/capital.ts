import { and, desc, eq, sum } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import { acCapitalInvestments } from '@/src/capital/db/schema';
import { postLedgerEntry, reverseSourceLedger } from './ledger';
import { logActivity } from './activity';

export type CreateCapitalInput = {
  investedAt: string;
  amountPaise: number;
  paymentMode: string;
  referenceNumber?: string;
  notes?: string;
};

export async function createCapitalInvestment(input: CreateCapitalInput) {
  if (input.amountPaise <= 0) throw new Error('Capital amount must be positive');

  return capitalDb.transaction(async (tx) => {
    const [row] = await tx
      .insert(acCapitalInvestments)
      .values({
        investedAt: input.investedAt,
        amountPaise: input.amountPaise,
        paymentMode: input.paymentMode as typeof acCapitalInvestments.$inferInsert.paymentMode,
        referenceNumber: input.referenceNumber,
        notes: input.notes,
      })
      .returning();

    await postLedgerEntry(
      {
        entryType: 'capital_investment',
        direction: 'debit',
        amountPaise: input.amountPaise,
        sourceTable: 'ac_capital_investments',
        sourceId: row.id,
        description: `Capital invested: ₹${(input.amountPaise / 100).toLocaleString('en-IN')}`,
      },
      tx,
    );

    await logActivity(
      {
        action: 'capital_invested',
        entityType: 'capital',
        entityId: row.id,
        afterState: { amountPaise: input.amountPaise },
      },
      tx,
    );

    return row;
  });
}

export async function reverseCapitalInvestment(investmentId: string, reason: string) {
  return capitalDb.transaction(async (tx) => {
    const [inv] = await tx
      .update(acCapitalInvestments)
      .set({ isReversed: true })
      .where(and(eq(acCapitalInvestments.id, investmentId), eq(acCapitalInvestments.isReversed, false)))
      .returning();

    if (!inv) throw new Error('Investment not found or already reversed');

    await reverseSourceLedger(
      'ac_capital_investments',
      investmentId,
      `Capital reversal: ${reason}`,
      tx,
      'capital_investment',
    );

    await logActivity(
      {
        action: 'capital_reversed',
        entityType: 'capital',
        entityId: investmentId,
        afterState: { reason },
      },
      tx,
    );
  });
}

export async function listCapitalInvestments(includeReversed = false) {
  if (includeReversed) {
    return capitalDb.select().from(acCapitalInvestments).orderBy(desc(acCapitalInvestments.investedAt));
  }
  return capitalDb
    .select()
    .from(acCapitalInvestments)
    .where(eq(acCapitalInvestments.isReversed, false))
    .orderBy(desc(acCapitalInvestments.investedAt));
}

export async function getCapitalTotals() {
  const [row] = await capitalDb
    .select({ total: sum(acCapitalInvestments.amountPaise) })
    .from(acCapitalInvestments)
    .where(eq(acCapitalInvestments.isReversed, false));
  return Number(row?.total ?? 0);
}
