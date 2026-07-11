import { and, desc, eq, gte, lte, sql, sum } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import {
  acAssets,
  acLedgerEntries,
  acManualProfits,
} from '@/src/capital/db/schema';
import { computeProfitShare, type ProfitShareMode } from '@/src/capital/lib/profitShare';
import { postLedgerEntry } from './ledger';
import { logActivity } from './activity';

export type ManualProfitCategory =
  | 'investment_return'
  | 'adjustment'
  | 'bonus'
  | 'settlement'
  | 'other';

export type CreateManualProfitInput = {
  profitDate: string;
  amountPaise: number;
  source: string;
  description: string;
  category: ManualProfitCategory;
  share?: {
    mode: ProfitShareMode;
    partnerPct?: number;
    myPct?: number;
    partnerFixedPaise?: number;
    myFixedPaise?: number;
  };
};

export async function createManualProfit(input: CreateManualProfitInput) {
  if (input.amountPaise <= 0) throw new Error('Amount must be positive');
  if (!input.source.trim()) throw new Error('Source is required');
  if (!input.description.trim()) throw new Error('Description is required');

  const shareResult = computeProfitShare({
    grossPaise: input.amountPaise,
    mode: input.share?.mode ?? 'percentage',
    partnerPct: input.share?.partnerPct ?? 0,
    myPct: input.share?.myPct ?? 100,
    partnerFixedPaise: input.share?.partnerFixedPaise,
    myFixedPaise: input.share?.myFixedPaise,
  });

  return capitalDb.transaction(async (tx) => {
    const [row] = await tx
      .insert(acManualProfits)
      .values({
        amountPaise: input.amountPaise,
        profitDate: input.profitDate,
        source: input.source.trim(),
        description: input.description.trim(),
        category: input.category,
        profitShareMode: shareResult.mode,
        partnerSharePctBps: shareResult.partnerSharePctBps,
        mySharePctBps: shareResult.mySharePctBps,
        partnerSharePaise: shareResult.partnerSharePaise,
        mySharePaise: shareResult.mySharePaise,
      })
      .returning();

    // Ledger credits MY share only — partner cut is not cash to me
    await postLedgerEntry(
      {
        entryType: 'manual_profit',
        direction: 'credit',
        amountPaise: shareResult.mySharePaise,
        sourceTable: 'ac_manual_profits',
        sourceId: row.id,
        description: `Manual profit: ${input.source.trim()} — ${input.description.trim()}`,
        metadata: {
          category: input.category,
          source: input.source.trim(),
          profitDate: input.profitDate,
          grossPaise: shareResult.grossPaise,
          partnerSharePaise: shareResult.partnerSharePaise,
          mySharePaise: shareResult.mySharePaise,
        },
      },
      tx,
    );

    await logActivity(
      {
        action: 'manual_profit_added',
        entityType: 'manual_profit',
        entityId: row.id,
        afterState: {
          amountPaise: input.amountPaise,
          mySharePaise: shareResult.mySharePaise,
          partnerSharePaise: shareResult.partnerSharePaise,
          category: input.category,
          source: input.source.trim(),
        },
      },
      tx,
    );

    return row;
  });
}

export async function sumManualProfitsPaise(opts?: {
  from?: string;
  to?: string;
}): Promise<number> {
  const conditions = [eq(acManualProfits.isReversed, false)];
  if (opts?.from) conditions.push(gte(acManualProfits.profitDate, opts.from));
  if (opts?.to) conditions.push(lte(acManualProfits.profitDate, opts.to));

  const [row] = await capitalDb
    .select({ total: sum(acManualProfits.amountPaise) })
    .from(acManualProfits)
    .where(and(...conditions));
  return Number(row?.total ?? 0);
}

export async function sumManualMySharePaise(opts?: {
  from?: string;
  to?: string;
}): Promise<number> {
  const conditions = [eq(acManualProfits.isReversed, false)];
  if (opts?.from) conditions.push(gte(acManualProfits.profitDate, opts.from));
  if (opts?.to) conditions.push(lte(acManualProfits.profitDate, opts.to));

  const [row] = await capitalDb
    .select({ total: sum(acManualProfits.mySharePaise) })
    .from(acManualProfits)
    .where(and(...conditions));
  return Number(row?.total ?? 0);
}

export async function listManualProfits(limit = 50) {
  return capitalDb
    .select()
    .from(acManualProfits)
    .where(eq(acManualProfits.isReversed, false))
    .orderBy(desc(acManualProfits.profitDate), desc(acManualProfits.createdAt))
    .limit(limit);
}

export async function monthlyManualProfitSeries(opts?: { mine?: boolean }) {
  const valueCol = opts?.mine ? acManualProfits.mySharePaise : acManualProfits.amountPaise;
  const rows = await capitalDb
    .select({
      month: sql<string>`to_char(${acManualProfits.profitDate}::date, 'YYYY-MM')`,
      total: sum(valueCol),
    })
    .from(acManualProfits)
    .where(eq(acManualProfits.isReversed, false))
    .groupBy(sql`to_char(${acManualProfits.profitDate}::date, 'YYYY-MM')`)
    .orderBy(sql`to_char(${acManualProfits.profitDate}::date, 'YYYY-MM')`);
  return rows.map((r) => ({ month: r.month, valuePaise: Number(r.total ?? 0) }));
}

export async function assertManualProfitLedgerPresent(id: string) {
  const [entry] = await capitalDb
    .select({ id: acLedgerEntries.id })
    .from(acLedgerEntries)
    .where(
      and(
        eq(acLedgerEntries.sourceTable, 'ac_manual_profits'),
        eq(acLedgerEntries.sourceId, id),
      ),
    )
    .limit(1);
  return Boolean(entry);
}

export async function countActiveAssets() {
  const [row] = await capitalDb
    .select({ c: sql<number>`count(*)::int` })
    .from(acAssets)
    .where(sql`${acAssets.status} NOT IN ('sold', 'settled', 'cancelled')`);
  return Number(row?.c ?? 0);
}
