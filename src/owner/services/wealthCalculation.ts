import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { ownerDb } from '@/src/owner/db/client';
import { ooIntegrationFacts } from '@/src/owner/db/schema';
import {
  periodBounds,
  type PeriodKey,
  type SourceSystem,
} from '@/src/owner/lib/wealth/types';
import {
  getTotalBankBalancePaise,
  sumJournalByEventType,
} from '@/src/owner/services/journal';
import { getAssetBreakdown } from '@/src/owner/services/assetAggregation';
import { getOwnerIncomeBreakdown } from '@/src/owner/services/ownerIncomeBreakdown';
import { sumLiabilityPrincipalPaid } from '@/src/owner/services/reconciliation';

export type WealthSnapshot = {
  asOf: string;
  totalAssetsPaise: number;
  totalLiabilitiesPaise: number;
  /** Gross net worth = total assets (before liabilities). */
  grossNetWorthPaise: number;
  /** Actual net worth = total assets − total liabilities. */
  netWorthPaise: number;
  bankBalancePaise: number;
  propertyValuePaise: number;
  investmentValuePaise: number;
  assetBreakdown: {
    fixedAssetsPaise: number;
    movableAssetsPaise: number;
    financialAssetsPaise: number;
  };
  cashFlow: Record<PeriodKey, {
    incomePaise: number;
    expensePaise: number;
    netPaise: number;
  }>;
  expensesBySource: Array<{ sourceSystem: SourceSystem; totalPaise: number }>;
  wealthChange: {
    operatingCashFlowPaise: number;
    liabilityPrincipalPaidPaise: number;
    unrealizedAssetChangePaise: number;
  };
  incomeBreakdown: {
    propertyExpectedMonthlyPaise: number;
    propertyActualPaise: number;
    businessIncomePaise: number;
    otherIncomePaise: number;
  };
};

export async function sumIntegrationFacts(opts: {
  kind: 'REVENUE' | 'EXPENSE' | 'PROFIT' | 'ASSET_VALUE' | 'LIABILITY' | 'OTHER';
  startDate?: string;
  endDate?: string;
  sourceSystem?: SourceSystem;
}) {
  const conditions = [eq(ooIntegrationFacts.kind, opts.kind)];
  if (opts.startDate) conditions.push(gte(ooIntegrationFacts.periodStart, opts.startDate));
  if (opts.endDate) conditions.push(lte(ooIntegrationFacts.periodEnd, opts.endDate));
  if (opts.sourceSystem) conditions.push(eq(ooIntegrationFacts.sourceSystem, opts.sourceSystem));

  const [row] = await ownerDb
    .select({
      total: sql<number>`COALESCE(SUM(${ooIntegrationFacts.amountPaise}), 0)::bigint`,
    })
    .from(ooIntegrationFacts)
    .where(and(...conditions));

  return Number(row?.total ?? 0);
}

export async function sumExpensesBySource(startDate?: string, endDate?: string) {
  const journalConditions = [sql`${ooIntegrationFacts.kind} = 'EXPENSE'`];
  if (startDate) journalConditions.push(gte(ooIntegrationFacts.periodStart, startDate));
  if (endDate) journalConditions.push(lte(ooIntegrationFacts.periodEnd, endDate));

  const integrationRows = await ownerDb
    .select({
      sourceSystem: ooIntegrationFacts.sourceSystem,
      total: sql<number>`COALESCE(SUM(${ooIntegrationFacts.amountPaise}), 0)::bigint`,
    })
    .from(ooIntegrationFacts)
    .where(and(...journalConditions))
    .groupBy(ooIntegrationFacts.sourceSystem);

  const ownerOsJournal = await sumJournalByEventType({
    eventTypes: ['EXPENSE'],
    startDate,
    endDate,
    sourceSystem: 'OWNER_OS',
  });

  const bySource: Record<string, number> = { OWNER_OS: ownerOsJournal };
  for (const row of integrationRows) {
    bySource[row.sourceSystem] = (bySource[row.sourceSystem] ?? 0) + Number(row.total);
  }

  return Object.entries(bySource).map(([sourceSystem, totalPaise]) => ({
    sourceSystem: sourceSystem as SourceSystem,
    totalPaise,
  }));
}

export async function getWealthSnapshot(opts?: {
  asOfDate?: string;
  investmentValuePaise?: number;
}): Promise<WealthSnapshot> {
  const asOf = opts?.asOfDate ?? new Date().toISOString().slice(0, 10);

  const capitalVehiclePaise = opts?.investmentValuePaise ?? 0;

  const breakdown = await getAssetBreakdown({
    asOfDate: asOf,
    capitalVehiclePaise,
  });

  const bankBalancePaise = breakdown.financialAssetsPaise;
  const propertyValuePaise = breakdown.fixedAssetsPaise;
  const investmentValuePaise = capitalVehiclePaise;
  const totalAssetsPaise = breakdown.totalAssetsPaise;
  const liabilityPaise = breakdown.totalLiabilitiesPaise;
  const grossNetWorthPaise = breakdown.grossNetWorthPaise;
  const netWorthPaise = breakdown.netWorthPaise;

  const periods: PeriodKey[] = ['today', 'week', 'month', 'quarter', 'year', 'lifetime'];
  const cashFlow: WealthSnapshot['cashFlow'] = {
    today: { incomePaise: 0, expensePaise: 0, netPaise: 0 },
    week: { incomePaise: 0, expensePaise: 0, netPaise: 0 },
    month: { incomePaise: 0, expensePaise: 0, netPaise: 0 },
    quarter: { incomePaise: 0, expensePaise: 0, netPaise: 0 },
    year: { incomePaise: 0, expensePaise: 0, netPaise: 0 },
    lifetime: { incomePaise: 0, expensePaise: 0, netPaise: 0 },
  };

  for (const period of periods) {
    const { start, end } = periodBounds(period, asOf);
    const journalIncome = await sumJournalByEventType({
      eventTypes: ['INCOME'],
      startDate: start,
      endDate: end,
    });
    const journalExpense = await sumJournalByEventType({
      eventTypes: ['EXPENSE'],
      startDate: start,
      endDate: end,
    });
    const integratedRevenue = await sumIntegrationFacts({
      kind: 'REVENUE',
      startDate: start,
      endDate: end,
    });
    const integratedExpense = await sumIntegrationFacts({
      kind: 'EXPENSE',
      startDate: start,
      endDate: end,
    });
    const integratedProfit = await sumIntegrationFacts({
      kind: 'PROFIT',
      startDate: start,
      endDate: end,
    });

    const incomePaise = journalIncome + integratedRevenue + integratedProfit;
    const expensePaise = journalExpense + integratedExpense;
    cashFlow[period] = {
      incomePaise,
      expensePaise,
      netPaise: incomePaise - expensePaise,
    };
  }

  const monthBounds = periodBounds('month', asOf);
  const expensesBySource = await sumExpensesBySource(monthBounds.start, monthBounds.end);

  const liabilityPrincipalPaid = await sumLiabilityPrincipalPaid({
    startDate: monthBounds.start,
    endDate: monthBounds.end,
  });

  const incomeBreakdown = await getOwnerIncomeBreakdown('month', asOf);

  return {
    asOf,
    totalAssetsPaise,
    totalLiabilitiesPaise: liabilityPaise,
    grossNetWorthPaise,
    netWorthPaise,
    bankBalancePaise,
    propertyValuePaise,
    investmentValuePaise,
    assetBreakdown: {
      fixedAssetsPaise: breakdown.fixedAssetsPaise,
      movableAssetsPaise: breakdown.movableAssetsPaise,
      financialAssetsPaise: breakdown.financialAssetsPaise,
    },
    cashFlow,
    expensesBySource,
    wealthChange: {
      operatingCashFlowPaise: cashFlow.month.netPaise,
      liabilityPrincipalPaidPaise: liabilityPrincipalPaid,
      unrealizedAssetChangePaise: 0,
    },
    incomeBreakdown: {
      propertyExpectedMonthlyPaise: incomeBreakdown.propertyExpectedMonthlyPaise,
      propertyActualPaise: incomeBreakdown.propertyActualPaise,
      businessIncomePaise: incomeBreakdown.businessIncomePaise,
      otherIncomePaise: incomeBreakdown.otherIncomePaise,
    },
  };
}
