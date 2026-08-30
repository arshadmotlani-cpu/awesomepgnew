import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { ownerDb } from '@/src/owner/db/client';
import { ooLiabilities, ooLiabilitySchedules } from '@/src/owner/db/schema';
import {
  getLiabilityCalculator,
  type LiabilityContext,
} from '@/src/owner/lib/liabilities/calculators';
import { coerceWealthBps, coerceWealthPaise } from '@/src/owner/lib/wealth/paiseCoercion';
import { paiseFromRupees, todayIsoDate } from '@/src/owner/lib/wealth/types';
import { createJournalEntry } from '@/src/owner/services/journal';
import { writeAuditLog } from '@/src/owner/services/auditLog';

function toContext(row: typeof ooLiabilities.$inferSelect): LiabilityContext {
  return {
    id: row.id,
    liabilityType: row.liabilityType,
    currentPrincipalPaise: coerceWealthPaise(row.currentPrincipalPaise),
    originalPrincipalPaise: coerceWealthPaise(row.originalPrincipalPaise),
    interestRateBps: coerceWealthBps(row.interestRateBps),
    accruedInterestPaise: coerceWealthPaise(row.accruedInterestPaise),
    lastAccrualDate: row.lastAccrualDate,
    startDate: row.startDate,
    tenureMonths: row.tenureMonths,
    fixedPaymentPaise: row.fixedPaymentPaise
      ? coerceWealthPaise(row.fixedPaymentPaise)
      : null,
    repaymentFrequency: row.repaymentFrequency,
    rulesJson: row.rulesJson ?? {},
  };
}

export async function listLiabilities(activeOnly = true) {
  const query = ownerDb.select().from(ooLiabilities).orderBy(desc(ooLiabilities.createdAt));
  if (activeOnly) {
    return query.where(eq(ooLiabilities.isActive, 1));
  }
  return query;
}

export async function getLiability(id: string) {
  const [row] = await ownerDb
    .select()
    .from(ooLiabilities)
    .where(eq(ooLiabilities.id, id))
    .limit(1);
  return row ?? null;
}

export async function createLiability(input: {
  name: string;
  lender?: string | null;
  liabilityType: LiabilityContext['liabilityType'];
  originalPrincipalRupees: number;
  currentPrincipalRupees?: number;
  interestRatePct?: number;
  startDate?: string | null;
  firstPaymentDate?: string | null;
  endDate?: string | null;
  tenureMonths?: number | null;
  fixedPaymentRupees?: number | null;
  assetId?: string | null;
  businessId?: string | null;
  rulesJson?: Record<string, unknown>;
  notes?: string | null;
  createdBy?: string | null;
}) {
  const original = paiseFromRupees(input.originalPrincipalRupees);
  const current = paiseFromRupees(input.currentPrincipalRupees ?? input.originalPrincipalRupees);

  const [row] = await ownerDb
    .insert(ooLiabilities)
    .values({
      name: input.name.trim(),
      lender: input.lender?.trim() || null,
      liabilityType: input.liabilityType,
      originalPrincipalPaise: original,
      currentPrincipalPaise: current,
      interestRateBps: Math.round((input.interestRatePct ?? 0) * 100),
      startDate: input.startDate ?? null,
      firstPaymentDate: input.firstPaymentDate ?? null,
      endDate: input.endDate ?? null,
      tenureMonths: input.tenureMonths ?? null,
      fixedPaymentPaise: input.fixedPaymentRupees
        ? paiseFromRupees(input.fixedPaymentRupees)
        : null,
      assetId: input.assetId ?? null,
      businessId: input.businessId ?? null,
      rulesJson: input.rulesJson ?? {},
      notes: input.notes?.trim() || null,
      createdBy: input.createdBy ?? null,
      lastAccrualDate: input.startDate ?? null,
    })
    .returning();

  await writeAuditLog({
    entityType: 'liability',
    entityId: row.id,
    action: 'create',
    afterJson: row as unknown as Record<string, unknown>,
    actorId: input.createdBy,
  });

  return row;
}

export async function getLiabilityDue(id: string, asOfDate = todayIsoDate()) {
  const liability = await getLiability(id);
  if (!liability) return null;
  const calc = getLiabilityCalculator(liability.liabilityType);
  const ctx = toContext(liability);
  return calc.getDue(ctx, asOfDate);
}

export async function payLiability(input: {
  liabilityId: string;
  amountRupees: number;
  paymentDate: string;
  accountId?: string | null;
  allocationMode?: 'AUTO' | 'MANUAL';
  manualInterestRupees?: number;
  manualPrincipalRupees?: number;
  notes?: string | null;
  createdBy?: string | null;
}) {
  const liability = await getLiability(input.liabilityId);
  if (!liability) throw new Error('Liability not found');

  const calc = getLiabilityCalculator(liability.liabilityType);
  const ctx = toContext(liability);
  const amountPaise = paiseFromRupees(input.amountRupees);

  const manual =
    input.allocationMode === 'MANUAL' &&
    input.manualInterestRupees != null &&
    input.manualPrincipalRupees != null
      ? {
          interestPaise: paiseFromRupees(input.manualInterestRupees),
          principalPaise: paiseFromRupees(input.manualPrincipalRupees),
        }
      : undefined;

  const allocation = calc.allocatePayment(
    ctx,
    amountPaise,
    input.paymentDate,
    input.allocationMode ?? 'AUTO',
    manual,
  );

  const newPrincipal = Math.max(
    0,
    liability.currentPrincipalPaise -
      allocation.principalPaise -
      allocation.surplusPrincipalPaise,
  );
  const newAccrued = allocation.remainingAccruedPaise;

  await ownerDb
    .update(ooLiabilities)
    .set({
      currentPrincipalPaise: newPrincipal,
      accruedInterestPaise: newAccrued,
      lastAccrualDate: input.paymentDate,
      updatedAt: new Date(),
    })
    .where(eq(ooLiabilities.id, liability.id));

  const entries: Array<{
    entryDate: string;
    description: string;
    eventType: 'EXPENSE' | 'LIABILITY_PAYMENT';
    lines: Array<{
      amountPaise: number;
      eventType: 'EXPENSE' | 'LIABILITY_PAYMENT';
      category?: 'LOAN_INTEREST';
      accountId?: string | null;
      liabilityId: string;
      assetId: string | null;
      businessId: string | null;
      notes?: string | null;
      allocation?: {
        interestPaise: number;
        principalPaise: number;
        allocationMode: 'AUTO' | 'MANUAL';
      };
    }>;
  }> = [];

  const principalPaidPaise =
    allocation.principalPaise + allocation.surplusPrincipalPaise;

  if (allocation.interestPaise > 0) {
    entries.push({
      entryDate: input.paymentDate,
      description: `Loan interest — ${liability.name}`,
      eventType: 'EXPENSE',
      lines: [
        {
          amountPaise: allocation.interestPaise,
          eventType: 'EXPENSE',
          category: 'LOAN_INTEREST',
          accountId: input.accountId ?? null,
          liabilityId: liability.id,
          assetId: liability.assetId,
          businessId: liability.businessId,
          notes: input.notes ?? null,
        },
      ],
    });
  }

  if (principalPaidPaise > 0) {
    entries.push({
      entryDate: input.paymentDate,
      description: `Loan principal — ${liability.name}`,
      eventType: 'LIABILITY_PAYMENT',
      lines: [
        {
          amountPaise: principalPaidPaise,
          eventType: 'LIABILITY_PAYMENT',
          accountId: input.accountId ?? null,
          liabilityId: liability.id,
          assetId: liability.assetId,
          businessId: liability.businessId,
          notes: input.notes ?? null,
          allocation: {
            interestPaise: 0,
            principalPaise: principalPaidPaise,
            allocationMode: input.allocationMode ?? 'AUTO',
          },
        },
      ],
    });
  }

  let journalEntryId: string | undefined;
  for (const entry of entries) {
    const { entry: row } = await createJournalEntry({
      entryDate: entry.entryDate,
      description: entry.description,
      eventType: entry.eventType,
      createdBy: input.createdBy,
      lines: entry.lines,
    });
    journalEntryId = row.id;
  }

  if (!journalEntryId) {
    throw new Error('Payment produced no journal entries');
  }

  await writeAuditLog({
    entityType: 'liability',
    entityId: liability.id,
    action: 'payment',
    beforeJson: liability as unknown as Record<string, unknown>,
    afterJson: {
      allocation,
      newPrincipalPaise: newPrincipal,
      journalEntryId,
    },
    actorId: input.createdBy,
  });

  return {
    allocation,
    newPrincipalPaise: newPrincipal,
    journalEntryId,
  };
}

export async function getTotalLiabilityPaise(): Promise<number> {
  const rows = await listLiabilities();
  let total = 0;
  const asOf = todayIsoDate();
  for (const row of rows) {
    const calc = getLiabilityCalculator(row.liabilityType);
    const due = calc.getDue(toContext(row), asOf);
    total += row.currentPrincipalPaise + due.interestDuePaise;
  }
  return total;
}

export async function listUpcomingDues(opts?: {
  startDate?: string;
  endDate?: string;
  limit?: number;
}) {
  const start = opts?.startDate ?? todayIsoDate();
  const end = opts?.endDate ?? start;
  const liabilities = await listLiabilities();

  const dues = [];
  for (const liability of liabilities) {
    const calc = getLiabilityCalculator(liability.liabilityType);
    const due = calc.getDue(toContext(liability), start);
    if (due.totalDuePaise > 0) {
      dues.push({
        liability,
        due,
      });
    }
  }

  const scheduled = await ownerDb
    .select()
    .from(ooLiabilitySchedules)
    .where(
      and(
        gte(ooLiabilitySchedules.dueDate, start),
        lte(ooLiabilitySchedules.dueDate, end),
        sql`${ooLiabilitySchedules.status} NOT IN ('PAID', 'SKIPPED')`,
      ),
    )
    .orderBy(ooLiabilitySchedules.dueDate)
    .limit(opts?.limit ?? 50);

  return { computedDues: dues, scheduled };
}

export async function getLiabilityDetail(id: string) {
  const liability = await getLiability(id);
  if (!liability) return null;

  const due = await getLiabilityDue(id);
  const schedules = await ownerDb
    .select()
    .from(ooLiabilitySchedules)
    .where(eq(ooLiabilitySchedules.liabilityId, id))
    .orderBy(desc(ooLiabilitySchedules.dueDate));

  const { listLiabilityPayments } = await import('@/src/owner/services/journal');
  const payments = await listLiabilityPayments(id);

  const totalPrincipalPaid = payments.reduce((sum, p) => {
    if (p.eventType === 'LIABILITY_PAYMENT') {
      return sum + Number(p.allocation?.principalPaise ?? p.amountPaise);
    }
    return sum;
  }, 0);
  const totalInterestPaid = payments.reduce((sum, p) => {
    if (p.eventType === 'EXPENSE' && p.category === 'LOAN_INTEREST') {
      return sum + p.amountPaise;
    }
    if (p.allocation?.interestPaise) {
      return sum + Number(p.allocation.interestPaise);
    }
    return sum;
  }, 0);

  return {
    liability,
    due,
    schedules,
    payments,
    totalPrincipalPaidPaise: totalPrincipalPaid,
    totalInterestPaidPaise: totalInterestPaid,
  };
}
