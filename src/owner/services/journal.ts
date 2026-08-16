import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { ownerDb } from '@/src/owner/db/client';
import {
  ooFinancialAccounts,
  ooJournalEntries,
  ooJournalLineAllocations,
  ooJournalLines,
} from '@/src/owner/db/schema';
import type {
  EconomicEventType,
  ExpenseCategory,
  SourceSystem,
} from '@/src/owner/lib/wealth/types';
import { writeAuditLog } from '@/src/owner/services/auditLog';

export type JournalLineInput = {
  amountPaise: number;
  eventType: EconomicEventType;
  category?: ExpenseCategory | null;
  subcategory?: string | null;
  accountId?: string | null;
  assetId?: string | null;
  liabilityId?: string | null;
  businessId?: string | null;
  notes?: string | null;
  allocation?: {
    interestPaise: number;
    principalPaise: number;
    allocationMode?: 'AUTO' | 'MANUAL';
  } | null;
};

export type CreateJournalEntryInput = {
  entryDate: string;
  description: string;
  eventType: EconomicEventType;
  sourceSystem?: SourceSystem;
  externalRef?: string | null;
  createdBy?: string | null;
  lines: JournalLineInput[];
};

export async function listJournalEntries(opts?: {
  startDate?: string;
  endDate?: string;
  eventType?: EconomicEventType;
  sourceSystem?: SourceSystem;
  limit?: number;
}) {
  const conditions = [];
  if (opts?.startDate) conditions.push(gte(ooJournalEntries.entryDate, opts.startDate));
  if (opts?.endDate) conditions.push(lte(ooJournalEntries.entryDate, opts.endDate));
  if (opts?.eventType) conditions.push(eq(ooJournalEntries.eventType, opts.eventType));
  if (opts?.sourceSystem) conditions.push(eq(ooJournalEntries.sourceSystem, opts.sourceSystem));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return ownerDb
    .select()
    .from(ooJournalEntries)
    .where(where)
    .orderBy(desc(ooJournalEntries.entryDate), desc(ooJournalEntries.createdAt))
    .limit(opts?.limit ?? 200);
}

export async function getJournalEntryWithLines(entryId: string) {
  const [entry] = await ownerDb
    .select()
    .from(ooJournalEntries)
    .where(eq(ooJournalEntries.id, entryId))
    .limit(1);
  if (!entry) return null;

  const lines = await ownerDb
    .select()
    .from(ooJournalLines)
    .where(eq(ooJournalLines.entryId, entryId));

  const lineIds = lines.map((l) => l.id);
  const allocations =
    lineIds.length > 0
      ? await ownerDb
          .select()
          .from(ooJournalLineAllocations)
          .where(inArray(ooJournalLineAllocations.journalLineId, lineIds))
      : [];

  return {
    entry,
    lines,
    allocations,
  };
}

export async function createJournalEntry(input: CreateJournalEntryInput) {
  if (input.lines.length === 0) throw new Error('Journal entry requires at least one line');
  if (input.externalRef) {
    const existing = await ownerDb
      .select({ id: ooJournalEntries.id })
      .from(ooJournalEntries)
      .where(
        and(
          eq(ooJournalEntries.sourceSystem, input.sourceSystem ?? 'OWNER_OS'),
          eq(ooJournalEntries.externalRef, input.externalRef),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      return { entry: existing[0], deduplicated: true as const };
    }
  }

  const totalPaise = input.lines.reduce((sum, l) => sum + l.amountPaise, 0);
  if (totalPaise <= 0) throw new Error('Journal entry total must be positive');

  const [entry] = await ownerDb
    .insert(ooJournalEntries)
    .values({
      entryDate: input.entryDate,
      description: input.description.trim(),
      eventType: input.eventType,
      sourceSystem: input.sourceSystem ?? 'OWNER_OS',
      externalRef: input.externalRef ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning();

  for (const line of input.lines) {
    const [row] = await ownerDb
      .insert(ooJournalLines)
      .values({
        entryId: entry.id,
        amountPaise: line.amountPaise,
        eventType: line.eventType,
        category: line.category ?? null,
        subcategory: line.subcategory ?? null,
        accountId: line.accountId ?? null,
        assetId: line.assetId ?? null,
        liabilityId: line.liabilityId ?? null,
        businessId: line.businessId ?? null,
        notes: line.notes ?? null,
      })
      .returning();

    if (line.allocation) {
      await ownerDb.insert(ooJournalLineAllocations).values({
        journalLineId: row.id,
        interestPaise: line.allocation.interestPaise,
        principalPaise: line.allocation.principalPaise,
        allocationMode: line.allocation.allocationMode ?? 'AUTO',
      });
    }
  }

  await writeAuditLog({
    entityType: 'journal_entry',
    entityId: entry.id,
    action: 'create',
    afterJson: { ...entry, lineCount: input.lines.length },
    actorId: input.createdBy,
  });

  return { entry, deduplicated: false as const };
}

export async function sumJournalByEventType(opts: {
  eventTypes: EconomicEventType[];
  startDate?: string;
  endDate?: string;
  sourceSystem?: SourceSystem;
}) {
  const conditions = [inArray(ooJournalLines.eventType, opts.eventTypes)];
  if (opts.startDate) conditions.push(gte(ooJournalEntries.entryDate, opts.startDate));
  if (opts.endDate) conditions.push(lte(ooJournalEntries.entryDate, opts.endDate));
  if (opts.sourceSystem) conditions.push(eq(ooJournalEntries.sourceSystem, opts.sourceSystem));

  const [row] = await ownerDb
    .select({
      totalPaise: sql<number>`COALESCE(SUM(${ooJournalLines.amountPaise}), 0)::bigint`,
    })
    .from(ooJournalLines)
    .innerJoin(ooJournalEntries, eq(ooJournalLines.entryId, ooJournalEntries.id))
    .where(and(...conditions));

  return Number(row?.totalPaise ?? 0);
}

export async function getAccountBalancePaise(accountId: string): Promise<number> {
  const [inflows] = await ownerDb
    .select({
      total: sql<number>`COALESCE(SUM(${ooJournalLines.amountPaise}), 0)::bigint`,
    })
    .from(ooJournalLines)
    .innerJoin(ooJournalEntries, eq(ooJournalLines.entryId, ooJournalEntries.id))
    .where(
      and(
        eq(ooJournalLines.accountId, accountId),
        inArray(ooJournalLines.eventType, ['INCOME', 'OPENING_BALANCE', 'TRANSFER']),
      ),
    );

  const [outflows] = await ownerDb
    .select({
      total: sql<number>`COALESCE(SUM(${ooJournalLines.amountPaise}), 0)::bigint`,
    })
    .from(ooJournalLines)
    .innerJoin(ooJournalEntries, eq(ooJournalLines.entryId, ooJournalEntries.id))
    .where(
      and(
        eq(ooJournalLines.accountId, accountId),
        inArray(ooJournalLines.eventType, [
          'EXPENSE',
          'ASSET_PURCHASE',
          'LIABILITY_PAYMENT',
          'TRANSFER',
        ]),
      ),
    );

  return Number(inflows?.total ?? 0) - Number(outflows?.total ?? 0);
}

export async function getTotalBankBalancePaise(): Promise<number> {
  const accounts = await ownerDb
    .select({ id: ooFinancialAccounts.id })
    .from(ooFinancialAccounts)
    .where(eq(ooFinancialAccounts.isActive, 1));

  let total = 0;
  for (const account of accounts) {
    total += await getAccountBalancePaise(account.id);
  }
  return total;
}

export async function listExpensesWithSource(opts?: {
  startDate?: string;
  endDate?: string;
  limit?: number;
}) {
  const conditions = [eq(ooJournalLines.eventType, 'EXPENSE')];
  if (opts?.startDate) conditions.push(gte(ooJournalEntries.entryDate, opts.startDate));
  if (opts?.endDate) conditions.push(lte(ooJournalEntries.entryDate, opts.endDate));

  return ownerDb
    .select({
      id: ooJournalLines.id,
      entryId: ooJournalEntries.id,
      entryDate: ooJournalEntries.entryDate,
      description: ooJournalEntries.description,
      sourceSystem: ooJournalEntries.sourceSystem,
      amountPaise: ooJournalLines.amountPaise,
      category: ooJournalLines.category,
      subcategory: ooJournalLines.subcategory,
      accountId: ooJournalLines.accountId,
      assetId: ooJournalLines.assetId,
      liabilityId: ooJournalLines.liabilityId,
      businessId: ooJournalLines.businessId,
      notes: ooJournalLines.notes,
    })
    .from(ooJournalLines)
    .innerJoin(ooJournalEntries, eq(ooJournalLines.entryId, ooJournalEntries.id))
    .where(and(...conditions))
    .orderBy(desc(ooJournalEntries.entryDate), desc(ooJournalEntries.createdAt))
    .limit(opts?.limit ?? 200);
}

export async function listIncomeWithSource(opts?: {
  startDate?: string;
  endDate?: string;
  limit?: number;
}) {
  const conditions = [eq(ooJournalLines.eventType, 'INCOME')];
  if (opts?.startDate) conditions.push(gte(ooJournalEntries.entryDate, opts.startDate));
  if (opts?.endDate) conditions.push(lte(ooJournalEntries.entryDate, opts.endDate));

  return ownerDb
    .select({
      id: ooJournalLines.id,
      entryId: ooJournalEntries.id,
      entryDate: ooJournalEntries.entryDate,
      description: ooJournalEntries.description,
      sourceSystem: ooJournalEntries.sourceSystem,
      amountPaise: ooJournalLines.amountPaise,
      accountId: ooJournalLines.accountId,
      assetId: ooJournalLines.assetId,
      businessId: ooJournalLines.businessId,
      notes: ooJournalLines.notes,
    })
    .from(ooJournalLines)
    .innerJoin(ooJournalEntries, eq(ooJournalLines.entryId, ooJournalEntries.id))
    .where(and(...conditions))
    .orderBy(desc(ooJournalEntries.entryDate), desc(ooJournalEntries.createdAt))
    .limit(opts?.limit ?? 200);
}

export async function listLiabilityPayments(liabilityId: string, limit = 50) {
  const conditions = [
    eq(ooJournalLines.liabilityId, liabilityId),
    inArray(ooJournalLines.eventType, ['LIABILITY_PAYMENT', 'EXPENSE']),
  ];

  const lines = await ownerDb
    .select({
      id: ooJournalLines.id,
      entryId: ooJournalEntries.id,
      entryDate: ooJournalEntries.entryDate,
      description: ooJournalEntries.description,
      eventType: ooJournalLines.eventType,
      amountPaise: ooJournalLines.amountPaise,
      category: ooJournalLines.category,
    })
    .from(ooJournalLines)
    .innerJoin(ooJournalEntries, eq(ooJournalLines.entryId, ooJournalEntries.id))
    .where(and(...conditions))
    .orderBy(desc(ooJournalEntries.entryDate))
    .limit(limit);

  const lineIds = lines.map((l) => l.id);
  const allocations =
    lineIds.length > 0
      ? await ownerDb
          .select()
          .from(ooJournalLineAllocations)
          .where(inArray(ooJournalLineAllocations.journalLineId, lineIds))
      : [];

  const allocByLine = new Map(allocations.map((a) => [a.journalLineId, a]));

  return lines.map((line) => ({
    ...line,
    allocation: allocByLine.get(line.id) ?? null,
  }));
}
