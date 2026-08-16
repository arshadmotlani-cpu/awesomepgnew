/**
 * Property-level income, expense, liability, and equity aggregation.
 * Avoids double-counting PG income when linkedPgId is set.
 */
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { ownerDb } from '@/src/owner/db/client';
import {
  ooIntegrationFacts,
  ooJournalEntries,
  ooJournalLines,
  ooLiabilities,
  ooProperties,
  ooRecurringObligations,
} from '@/src/owner/db/schema';
import { coerceWealthPaise } from '@/src/owner/lib/wealth/paiseCoercion';
import {
  periodBounds,
  type EconomicEventType,
  type PeriodKey,
  todayIsoDate,
} from '@/src/owner/lib/wealth/types';
import { getLiabilityCalculator } from '@/src/owner/lib/liabilities/calculators';
import { getPropertyByAssetId } from '@/src/owner/services/properties';

function normalizeRecurringToMonthly(amountPaise: number, frequency: string): number {
  const amount = coerceWealthPaise(amountPaise);
  switch (frequency) {
    case 'DAILY':
      return Math.round(amount * 30);
    case 'WEEKLY':
      return Math.round((amount * 52) / 12);
    case 'MONTHLY':
      return amount;
    case 'QUARTERLY':
      return Math.round(amount / 3);
    case 'YEARLY':
      return Math.round(amount / 12);
    default:
      return amount;
  }
}

async function sumJournalForAsset(opts: {
  assetId: string;
  eventTypes: EconomicEventType[];
  startDate?: string;
  endDate?: string;
}): Promise<number> {
  const conditions = [
    eq(ooJournalLines.assetId, opts.assetId),
    inArray(ooJournalLines.eventType, opts.eventTypes),
  ];
  if (opts.startDate) conditions.push(gte(ooJournalEntries.entryDate, opts.startDate));
  if (opts.endDate) conditions.push(lte(ooJournalEntries.entryDate, opts.endDate));

  const [row] = await ownerDb
    .select({
      total: sql<number>`COALESCE(SUM(${ooJournalLines.amountPaise}), 0)::bigint`,
    })
    .from(ooJournalLines)
    .innerJoin(ooJournalEntries, eq(ooJournalLines.entryId, ooJournalEntries.id))
    .where(and(...conditions));

  return Number(row?.total ?? 0);
}

async function sumIntegrationForAsset(opts: {
  assetId: string;
  kind: 'REVENUE' | 'EXPENSE' | 'PROFIT';
  startDate?: string;
  endDate?: string;
}): Promise<number> {
  const conditions = [
    eq(ooIntegrationFacts.assetId, opts.assetId),
    eq(ooIntegrationFacts.kind, opts.kind),
  ];
  if (opts.startDate) conditions.push(gte(ooIntegrationFacts.periodStart, opts.startDate));
  if (opts.endDate) conditions.push(lte(ooIntegrationFacts.periodEnd, opts.endDate));

  const [row] = await ownerDb
    .select({
      total: sql<number>`COALESCE(SUM(${ooIntegrationFacts.amountPaise}), 0)::bigint`,
    })
    .from(ooIntegrationFacts)
    .where(and(...conditions));

  return Number(row?.total ?? 0);
}

async function sumRecurringMonthlyForAsset(assetId: string): Promise<number> {
  const rows = await ownerDb
    .select()
    .from(ooRecurringObligations)
    .where(
      and(eq(ooRecurringObligations.assetId, assetId), eq(ooRecurringObligations.isActive, 1)),
    );

  return rows.reduce(
    (sum, row) =>
      sum + normalizeRecurringToMonthly(row.amountPaise, row.frequency),
    0,
  );
}

export type PropertyFinancialSummary = {
  assetId: string;
  period: PeriodKey;
  periodStart: string;
  periodEnd: string;
  incomePaise: number;
  expensePaise: number;
  netIncomePaise: number;
  monthlyIncomePaise: number;
  monthlyExpensePaise: number;
  yearlyIncomePaise: number;
  yearlyExpensePaise: number;
  netMonthlyIncomePaise: number;
  netYearlyIncomePaise: number;
  incomeSources: {
    journalPaise: number;
    integrationPaise: number;
    configuredBaselinePaise: number;
  };
  expenseSources: {
    journalPaise: number;
    integrationPaise: number;
    recurringMonthlyPaise: number;
  };
  loanOutstandingPaise: number;
  monthlyEmiPaise: number;
  nextDueDate: string | null;
  nextDueAmountPaise: number;
  equityPaise: number;
};

export async function getPropertyFinancialSummary(
  assetId: string,
  opts?: { asOfDate?: string; ownerCurrentValuePaise?: number },
): Promise<PropertyFinancialSummary | null> {
  const base = await getPropertyByAssetId(assetId);
  if (!base) return null;

  const asOf = opts?.asOfDate ?? todayIsoDate();
  const monthBounds = periodBounds('month', asOf);
  const yearBounds = periodBounds('year', asOf);

  const journalIncomeMonth = await sumJournalForAsset({
    assetId,
    eventTypes: ['INCOME'],
    startDate: monthBounds.start,
    endDate: monthBounds.end,
  });
  const journalExpenseMonth = await sumJournalForAsset({
    assetId,
    eventTypes: ['EXPENSE'],
    startDate: monthBounds.start,
    endDate: monthBounds.end,
  });
  const journalIncomeYear = await sumJournalForAsset({
    assetId,
    eventTypes: ['INCOME'],
    startDate: yearBounds.start,
    endDate: yearBounds.end,
  });
  const journalExpenseYear = await sumJournalForAsset({
    assetId,
    eventTypes: ['EXPENSE'],
    startDate: yearBounds.start,
    endDate: yearBounds.end,
  });

  const integrationIncomeMonth =
    (await sumIntegrationForAsset({
      assetId,
      kind: 'REVENUE',
      startDate: monthBounds.start,
      endDate: monthBounds.end,
    })) +
    (await sumIntegrationForAsset({
      assetId,
      kind: 'PROFIT',
      startDate: monthBounds.start,
      endDate: monthBounds.end,
    }));
  const integrationExpenseMonth = await sumIntegrationForAsset({
    assetId,
    kind: 'EXPENSE',
    startDate: monthBounds.start,
    endDate: monthBounds.end,
  });
  const integrationIncomeYear =
    (await sumIntegrationForAsset({
      assetId,
      kind: 'REVENUE',
      startDate: yearBounds.start,
      endDate: yearBounds.end,
    })) +
    (await sumIntegrationForAsset({
      assetId,
      kind: 'PROFIT',
      startDate: yearBounds.start,
      endDate: yearBounds.end,
    }));
  const integrationExpenseYear = await sumIntegrationForAsset({
    assetId,
    kind: 'EXPENSE',
    startDate: yearBounds.start,
    endDate: yearBounds.end,
  });

  const linkedPg = base.property.linkedPgId ?? base.asset.linkedPgId;
  const configuredMonthlyRental = linkedPg
    ? 0
    : coerceWealthPaise(base.property.monthlyRentalIncomePaise);
  const configuredOtherMonthly = coerceWealthPaise(base.property.otherMonthlyIncomePaise);
  const configuredBaselineMonth = configuredMonthlyRental + configuredOtherMonthly;

  const monthlyIncome =
    journalIncomeMonth + integrationIncomeMonth + configuredBaselineMonth;
  const monthlyExpense =
    journalExpenseMonth + integrationExpenseMonth + (await sumRecurringMonthlyForAsset(assetId));
  const yearlyIncome =
    journalIncomeYear + integrationIncomeYear + configuredBaselineMonth * 12;
  const yearlyExpense =
    journalExpenseYear +
    integrationExpenseYear +
    (await sumRecurringMonthlyForAsset(assetId)) * 12;

  const liabilities = await ownerDb
    .select()
    .from(ooLiabilities)
    .where(and(eq(ooLiabilities.assetId, assetId), eq(ooLiabilities.isActive, 1)));

  let loanOutstandingPaise = 0;
  let monthlyEmiPaise = 0;
  let nextDueDate: string | null = null;
  let nextDueAmountPaise = 0;

  for (const liability of liabilities) {
    const calc = getLiabilityCalculator(liability.liabilityType);
    const ctx = {
      id: liability.id,
      liabilityType: liability.liabilityType,
      currentPrincipalPaise: liability.currentPrincipalPaise,
      originalPrincipalPaise: liability.originalPrincipalPaise,
      interestRateBps: liability.interestRateBps,
      accruedInterestPaise: liability.accruedInterestPaise,
      lastAccrualDate: liability.lastAccrualDate,
      startDate: liability.startDate,
      tenureMonths: liability.tenureMonths,
      fixedPaymentPaise: liability.fixedPaymentPaise,
      repaymentFrequency: liability.repaymentFrequency,
      rulesJson: liability.rulesJson ?? {},
    };
    const due = calc.getDue(ctx, asOf);
    loanOutstandingPaise += liability.currentPrincipalPaise + due.interestDuePaise;
    if (liability.fixedPaymentPaise) {
      monthlyEmiPaise += coerceWealthPaise(liability.fixedPaymentPaise);
    }
    if (due.totalDuePaise > 0 && (!nextDueDate || (due.dueDate && due.dueDate < nextDueDate))) {
      nextDueDate = due.dueDate;
      nextDueAmountPaise = due.totalDuePaise;
    }
  }

  const ownerValue = opts?.ownerCurrentValuePaise ?? 0;
  const equityPaise = ownerValue - loanOutstandingPaise;

  return {
    assetId,
    period: 'month',
    periodStart: monthBounds.start,
    periodEnd: monthBounds.end,
    incomePaise: monthlyIncome,
    expensePaise: monthlyExpense,
    netIncomePaise: monthlyIncome - monthlyExpense,
    monthlyIncomePaise: monthlyIncome,
    monthlyExpensePaise: monthlyExpense,
    yearlyIncomePaise: yearlyIncome,
    yearlyExpensePaise: yearlyExpense,
    netMonthlyIncomePaise: monthlyIncome - monthlyExpense,
    netYearlyIncomePaise: yearlyIncome - yearlyExpense,
    incomeSources: {
      journalPaise: journalIncomeMonth,
      integrationPaise: integrationIncomeMonth,
      configuredBaselinePaise: configuredBaselineMonth,
    },
    expenseSources: {
      journalPaise: journalExpenseMonth,
      integrationPaise: integrationExpenseMonth,
      recurringMonthlyPaise: await sumRecurringMonthlyForAsset(assetId),
    },
    loanOutstandingPaise,
    monthlyEmiPaise,
    nextDueDate,
    nextDueAmountPaise,
    equityPaise,
  };
}

export async function findAssetIdForPg(pgId: string): Promise<string | null> {
  const [row] = await ownerDb
    .select({ assetId: ooProperties.assetId })
    .from(ooProperties)
    .where(eq(ooProperties.linkedPgId, pgId))
    .limit(1);
  return row?.assetId ?? null;
}

export async function listPgLinkedProperties() {
  return ownerDb
    .select({
      assetId: ooProperties.assetId,
      linkedPgId: ooProperties.linkedPgId,
    })
    .from(ooProperties)
    .where(sql`${ooProperties.linkedPgId} IS NOT NULL`);
}

export type PropertyIncomeEntry = {
  id: string;
  date: string;
  description: string;
  sourceSystem: string;
  amountPaise: number;
  kind: 'journal' | 'integration';
};

/** Property-scoped income history — not duplicated in general income forms. */
export async function listPropertyIncomeHistory(assetId: string, limit = 50) {
  const journalRows = await ownerDb
    .select({
      id: ooJournalLines.id,
      entryDate: ooJournalEntries.entryDate,
      description: ooJournalEntries.description,
      sourceSystem: ooJournalEntries.sourceSystem,
      amountPaise: ooJournalLines.amountPaise,
    })
    .from(ooJournalLines)
    .innerJoin(ooJournalEntries, eq(ooJournalLines.entryId, ooJournalEntries.id))
    .where(
      and(eq(ooJournalLines.assetId, assetId), eq(ooJournalLines.eventType, 'INCOME')),
    )
    .orderBy(sql`${ooJournalEntries.entryDate} DESC`)
    .limit(limit);

  const integrationRows = await ownerDb
    .select()
    .from(ooIntegrationFacts)
    .where(
      and(
        eq(ooIntegrationFacts.assetId, assetId),
        inArray(ooIntegrationFacts.kind, ['REVENUE', 'PROFIT']),
      ),
    )
    .orderBy(sql`${ooIntegrationFacts.periodEnd} DESC`)
    .limit(limit);

  const entries: PropertyIncomeEntry[] = [
    ...journalRows.map((r) => ({
      id: r.id,
      date: r.entryDate,
      description: r.description,
      sourceSystem: r.sourceSystem,
      amountPaise: Number(r.amountPaise),
      kind: 'journal' as const,
    })),
    ...integrationRows.map((r) => ({
      id: r.id,
      date: r.periodEnd,
      description: `${r.sourceSystem} ${r.kind}`,
      sourceSystem: r.sourceSystem,
      amountPaise: Number(r.amountPaise),
      kind: 'integration' as const,
    })),
  ];

  return entries.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}
